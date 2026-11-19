import { Types } from 'mongoose';
import { throwException } from '@/lib/http/api-error';
import { MessageKey } from '@/lib/http/message-key';
import { UserModel } from '@/modules/auth/user.model';
import { requestBasePostSync } from '@/modules/telegram/base-posts.service';
import { imageStore } from './base-image.store';
import { CreateBaseInput, ListProposalsQuery, UpdateBaseInput } from './bases.schemas';
import { changeBase, saveNewBase } from './bases.service';
import {
  BASE_STATUSES,
  BaseStatus,
  DefenseBaseDocument,
  DefenseBaseModel,
  PublicDefenseBase,
  toPublicDefenseBase,
} from './defense-base.model';

/**
 * Proposals of a member not approved yet (waiting or rejected) at the same time: a rejected one
 * must be corrected or withdrawn before proposing more.
 */
export const MAX_OPEN_PROPOSALS = 10;

/** States in which a proposal still belongs to its author: it can be changed or withdrawn. */
const OPEN_STATES = [BaseStatus.PENDING, BaseStatus.REJECTED];

/** A user named in a proposal; `null` once the account is deleted. */
export interface ProposalUser {
  id: string;
  username: string;
}

/** A base proposed by a member, with its moderation state. */
export interface BaseProposal extends PublicDefenseBase {
  status: BaseStatus;
  /** When it was sent (again, after a rejection). */
  submittedAt: string;
  author: ProposalUser | null;
  /** Administrator who approved or rejected it; `null` while waiting. */
  reviewedBy: ProposalUser | null;
  reviewedAt: string | null;
  /** Only for rejected proposals. */
  rejectionReason: string | null;
}

/** The proposals in one state, with how many there are in each state (for the tabs). */
export interface BaseProposalList {
  items: BaseProposal[];
  counts: Record<BaseStatus, number>;
}

/**
 * A member proposes a base: saved as `PENDING`, out of the arsenal until an administrator approves
 * it. Same checks as a base added by an administrator (link, image, clan castle, duplicates).
 */
export async function proposeBase(authorId: string, input: CreateBaseInput): Promise<BaseProposal> {
  const open = await DefenseBaseModel.countDocuments({
    createdBy: authorId,
    status: { $in: OPEN_STATES },
  });
  if (open >= MAX_OPEN_PROPOSALS) {
    throwException(409, [{ key: MessageKey.BASE_PROPOSAL_LIMIT_REACHED, params: { max: MAX_OPEN_PROPOSALS } }]);
  }
  const base = await saveNewBase(authorId, input, {
    status: BaseStatus.PENDING,
    submittedAt: new Date(),
  });
  return (await withUsers([base]))[0]!;
}

/** The proposals of a member not approved yet (waiting first, then rejected), most recent first. */
export async function listMyProposals(authorId: string): Promise<BaseProposal[]> {
  const bases = await DefenseBaseModel.find({
    createdBy: authorId,
    status: { $in: OPEN_STATES },
  }).sort({
    status: 1, // PENDING before REJECTED
    submittedAt: -1,
    _id: -1,
  });
  return withUsers(bases);
}

/**
 * The author changes a proposal of theirs: a waiting one stays waiting; a rejected one is sent
 * again for review (`PENDING`, the rejection forgotten), even with no field changed. An approved
 * base is in the arsenal and no longer the author's to change (409); someone else's is not found.
 */
export async function updateMyProposal(
  authorId: string,
  id: string,
  input: UpdateBaseInput,
): Promise<{ proposal: BaseProposal; resubmitted: boolean }> {
  const base = await findOwnProposal(authorId, id);
  if (base.status === BaseStatus.APPROVED) notEditable();
  const resubmitted = base.status === BaseStatus.REJECTED;
  if (resubmitted) {
    base.set({
      status: BaseStatus.PENDING,
      submittedAt: new Date(),
      reviewedBy: null,
      reviewedAt: null,
      rejectionReason: null,
    });
  }
  // Saved only if no administrator approved or rejected it meanwhile: an approved base must never
  // change without a review.
  const saved = await changeBase(authorId, base, input, {
    onlyIf: { status: resubmitted ? BaseStatus.REJECTED : BaseStatus.PENDING },
    onlyIfFailed: notEditable,
  });
  return { proposal: (await withUsers([saved]))[0]!, resubmitted };
}

/** The author withdraws a proposal not approved yet: deleted with its image. */
export async function withdrawMyProposal(authorId: string, id: string): Promise<void> {
  const base = await findOwnProposal(authorId, id);
  const { deletedCount } = await DefenseBaseModel.deleteOne({
    _id: base._id,
    status: { $in: OPEN_STATES },
  });
  if (!deletedCount) notEditable();
  await imageStore.remove(base.imageKey);
}

/**
 * Proposals of the members in one state (administrators): waiting ones oldest first (the queue),
 * reviewed ones most recently reviewed first. Bases added by administrators are not proposals.
 */
export async function listProposals({ status }: ListProposalsQuery): Promise<BaseProposalList> {
  const proposals = { submittedAt: { $ne: null } };
  const [bases, totals] = await Promise.all([
    DefenseBaseModel.find({ ...proposals, status }).sort(
      status === BaseStatus.PENDING ? { submittedAt: 1, _id: 1 } : { reviewedAt: -1, _id: -1 },
    ),
    DefenseBaseModel.aggregate<{ _id: BaseStatus; n: number }>([
      { $match: proposals },
      { $group: { _id: '$status', n: { $sum: 1 } } },
    ]),
  ]);
  const counts = Object.fromEntries(BASE_STATUSES.map((s) => [s, 0])) as Record<BaseStatus, number>;
  for (const { _id, n } of totals) if (_id in counts) counts[_id] = n;
  return { items: await withUsers(bases), counts };
}

/** How many proposals wait for review (administrators: the badge of the menu). */
export async function countPendingProposals(): Promise<{ pending: number }> {
  return {
    pending: await DefenseBaseModel.countDocuments({ status: BaseStatus.PENDING, submittedAt: { $ne: null } }),
  };
}

/** Publishes a waiting proposal in the arsenal (and on Telegram), recording who approved it and when. */
export async function approveProposal(reviewerId: string, id: string): Promise<BaseProposal> {
  const proposal = await review(id, { status: BaseStatus.APPROVED, reviewedBy: reviewerId, rejectionReason: null });
  // Now in the arsenal: posted in the Telegram channel of its town hall.
  void requestBasePostSync();
  return proposal;
}

/** Refuses a waiting proposal with a reason for its author; it stays out of the arsenal. */
export async function rejectProposal(reviewerId: string, id: string, reason: string): Promise<BaseProposal> {
  return review(id, {
    status: BaseStatus.REJECTED,
    reviewedBy: reviewerId,
    rejectionReason: reason,
  });
}

/**
 * Approves or rejects a proposal in one atomic step, only while it is waiting: two administrators
 * reviewing it at once cannot both succeed (the second gets 409).
 */
async function review(
  id: string,
  decision: { status: BaseStatus; reviewedBy: string; rejectionReason: string | null },
): Promise<BaseProposal> {
  if (!Types.ObjectId.isValid(id)) throwException(404, MessageKey.BASE_NOT_FOUND);
  const base = await DefenseBaseModel.findOneAndUpdate(
    { _id: id, status: BaseStatus.PENDING, submittedAt: { $ne: null } },
    // `updatedAt` changes too: an approved base comes first among those of its town hall.
    { $set: { ...decision, reviewedAt: new Date(), updatedBy: decision.reviewedBy } },
    { returnDocument: 'after' },
  );
  if (!base) {
    if (await DefenseBaseModel.exists({ _id: id, submittedAt: { $ne: null } })) {
      throwException(409, MessageKey.BASE_PROPOSAL_NOT_PENDING);
    }
    throwException(404, MessageKey.BASE_NOT_FOUND);
  }
  return (await withUsers([base]))[0]!;
}

/** A proposal of this author (any state); 404 for other users' bases, as if they did not exist. */
async function findOwnProposal(authorId: string, id: string): Promise<DefenseBaseDocument> {
  const base = Types.ObjectId.isValid(id)
    ? await DefenseBaseModel.findOne({ _id: id, createdBy: authorId, submittedAt: { $ne: null } })
    : null;
  if (!base) throwException(404, MessageKey.BASE_NOT_FOUND);
  return base;
}

function notEditable(): never {
  return throwException(409, MessageKey.BASE_PROPOSAL_NOT_EDITABLE);
}

/** The proposals with the usernames of their authors and reviewers (one query for all of them). */
async function withUsers(bases: DefenseBaseDocument[]): Promise<BaseProposal[]> {
  const ids = [
    ...new Set(
      bases
        .flatMap((b) => [b.createdBy, b.reviewedBy])
        .filter(Boolean)
        .map(String),
    ),
  ];
  const users = ids.length
    ? await UserModel.find({ _id: { $in: ids } })
        .select('username')
        .lean()
    : [];
  const names = new Map(users.map((u) => [u._id.toString(), u.username]));
  const user = (id: Types.ObjectId | null | undefined): ProposalUser | null => {
    const username = id ? names.get(id.toString()) : undefined;
    return username ? { id: id!.toString(), username } : null;
  };
  return bases.map((base) => ({
    ...toPublicDefenseBase(base),
    status: base.status as BaseStatus,
    submittedAt: (base.submittedAt ?? base.createdAt).toISOString(),
    author: user(base.createdBy),
    reviewedBy: user(base.reviewedBy),
    reviewedAt: base.reviewedAt?.toISOString() ?? null,
    rejectionReason: base.rejectionReason ?? null,
  }));
}
