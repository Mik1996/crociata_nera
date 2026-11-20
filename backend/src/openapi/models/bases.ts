import { z } from 'zod';
import { TROOP_NAMES } from '@/modules/bases/clan-castle';
import { BASE_STATUSES } from '@/modules/bases/defense-base.model';
import { BASE_POST_STATUSES } from '@/modules/telegram/telegram-base-post.model';
import { dateTime, model, nullableDateTime } from './common';

export const ClanCastleTroop = model(
  'ClanCastleTroop',
  'Clan castle reinforcements recommended for a base.',
  z.strictObject({
    name: z.enum(TROOP_NAMES).describe('Troop, by its English name in the Clash of Clans API.'),
    count: z.number().int().min(1).describe('How many.'),
  }),
);

const defenseBaseFields = {
  id: z.string().describe('Base id (MongoDB ObjectId).'),
  townHallLevel: z.number().int().min(1).describe('Town hall level, from the layout link.'),
  layoutUrl: z
    .string()
    .describe('In-game "copy base" link (`https://link.clashofclans.com/<lang>?action=OpenLayout&id=TH18%3AHV%3A…`).'),
  description: z.string().describe('Notes about the base (empty when none).'),
  clanCastleTroops: z.array(ClanCastleTroop).describe('Recommended reinforcements (empty when not given).'),
  image: z
    .strictObject({
      key: z.string().describe('Random image key (24 URL-safe characters): changes with the image.'),
      width: z.number().int().describe('Width of the full image, in pixels.'),
      height: z.number().int().describe('Height of the full image, in pixels.'),
    })
    .describe('Screenshot of the base (WebP).'),
  createdAt: dateTime('Creation date.'),
  updatedAt: dateTime('Last change.'),
};

export const DefenseBase = model(
  'DefenseBase',
  'A defense base of the arsenal. Its screenshot is at `GET /base-images/{image.key}/thumb` (640 px) and `/full` (1400 px).',
  z.strictObject(defenseBaseFields),
);

export const DefenseBasePage = model(
  'DefenseBasePage',
  'A page of the arsenal.',
  z.strictObject({
    items: z.array(DefenseBase).describe('Bases of the page: highest town hall first, then the most recently changed.'),
    nextCursor: z.string().nullable().describe('Pass it as `cursor` to get the next page; `null` on the last page.'),
    townHallLevels: z
      .array(z.number().int())
      .describe('Town hall levels with at least one base (whatever the filter), highest first.'),
  }),
);

export const ProposalUser = model(
  'ProposalUser',
  'A user named in a base proposal; `null` once the account is deleted.',
  z.strictObject({
    id: z.string().describe('User id.'),
    username: z.string().describe('Username on the site.'),
  }),
);

export const BaseProposal = model(
  'BaseProposal',
  'A defense base proposed by a member, with its moderation state. Only `APPROVED` proposals are in the arsenal (`GET /bases`).',
  z.strictObject({
    ...defenseBaseFields,
    status: z
      .enum(BASE_STATUSES)
      .describe('`PENDING` (waiting for an administrator), `APPROVED` (in the arsenal) or `REJECTED`.'),
    submittedAt: dateTime('When it was sent, or sent again after a rejection.'),
    author: ProposalUser.nullable().describe('Who proposed it.'),
    reviewedBy: ProposalUser.nullable().describe('Administrator who approved or rejected it; `null` while waiting.'),
    reviewedAt: nullableDateTime('When it was approved or rejected; `null` while waiting.'),
    rejectionReason: z.string().nullable().describe('Why it was rejected; `null` unless rejected.'),
  }),
);

export const BaseTelegramState = model(
  'BaseTelegramState',
  'Where a proposed base goes (or went) on Telegram: the channel bound to its town hall and, once approved, its post.',
  z.strictObject({
    channel: z
      .strictObject({
        title: z.string().describe('Title of the chat.'),
        username: z.string().nullable().describe('Public `@username` without `@`; `null` for private chats.'),
        canPost: z.boolean().describe('The bot may publish there.'),
      })
      .nullable()
      .describe('The chat bound to the town hall of the base now; `null`: none (the base stays on the site only, its post waits).'),
    post: z
      .strictObject({
        status: z
          .enum([...BASE_POST_STATUSES, 'pending'])
          .describe('`sent` (in its channel), `noChannel` (waiting for a channel), `failed` (tried again later) or `pending` (goes out within seconds).'),
        error: z.string().nullable().describe('Error given by Telegram (English) when `failed`.'),
        retryAt: nullableDateTime('Next automatic attempt when `failed`.'),
      })
      .nullable()
      .describe('The post of an approved base; `null` while waiting.'),
  }),
);

export const ModeratedBaseProposal = model(
  'ModeratedBaseProposal',
  'A base proposal as administrators see it: with where it goes on Telegram.',
  BaseProposal.extend({
    telegram: BaseTelegramState.nullable().describe('`null` for rejected proposals and while Telegram is not configured.'),
  }),
);

export const BaseProposalList = model(
  'BaseProposalList',
  'The proposals in one state of the moderation.',
  z.strictObject({
    items: z
      .array(ModeratedBaseProposal)
      .describe('Waiting proposals oldest first; approved and rejected ones most recently reviewed first.'),
    counts: z
      .strictObject({
        PENDING: z.number().int().min(0).describe('Waiting for review.'),
        APPROVED: z.number().int().min(0).describe('Approved (in the arsenal).'),
        REJECTED: z.number().int().min(0).describe('Rejected.'),
      })
      .describe('Proposals in each state.'),
  }),
);
