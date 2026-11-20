import { z } from 'zod';
import { ApiName } from '@/lib/http/api-name';
import { MessageKey as K } from '@/lib/http/message-key';
import { IMAGE_CONTENT_TYPE } from '@/modules/bases/base-image';
import { MAX_OPEN_PROPOSALS } from '@/modules/bases/base-proposals.service';
import {
  createBaseSchema,
  listBasesQuerySchema,
  listProposalsQuerySchema,
  rejectProposalSchema,
  updateBaseSchema,
} from '@/modules/bases/bases.schemas';
import {
  BaseProposal,
  BaseProposalList,
  DefenseBase,
  DefenseBasePage,
} from '../models/bases';
import { ApiOperation, FieldDoc, requestPart } from '../operation';

const baseIdPath = requestPart(z.object({ id: z.string() }), {
  id: { description: 'Base id (MongoDB ObjectId).', example: '6730f1c2a4b5c6d7e8f90123' },
});

/** The screenshot, sent as a file of the multipart form. */
const image = z.file().mime(['image/jpeg', 'image/png', 'image/webp']);

const LAYOUT_URL: FieldDoc = {
  description:
    'In-game "copy base" link of a home village layout; the town hall level is read from it. The same layout cannot be added twice.',
  example: 'https://link.clashofclans.com/en?action=OpenLayout&id=TH18%3AHV%3AAAAAFQAAAALRVVKKOsCkPrNIeGUyK9Qd',
};
const DESCRIPTION: FieldDoc = 'Notes about the base, at most 1000 characters.';
const TROOPS: FieldDoc = {
  description:
    'Recommended clan castle reinforcements, as JSON text: `[{"name":"Golem","count":1}]`. English troop names of the Clash of Clans API; they must fit in the clan castle of the town hall.',
  example: '[{"name":"Golem","count":1},{"name":"Archer","count":5}]',
};
const IMAGE: FieldDoc =
  'Screenshot: JPEG, PNG or WebP, at most 10 MB. Re-encoded as WebP (640 px thumbnail, 1400 px full size); metadata is dropped.';

const FORM_ERRORS = [
  K.INVALID_FORM_DATA,
  K.LAYOUT_LINK_SHOULD_NOT_BE_EMPTY,
  K.LAYOUT_LINK_IS_NOT_VALID,
  K.DESCRIPTION_IS_TOO_LONG,
  K.CLAN_CASTLE_TROOPS_NOT_VALID,
  K.CLAN_CASTLE_OVER_CAPACITY,
  K.IMAGE_IS_NOT_VALID,
];

export const BASE_OPERATIONS: ApiOperation[] = [
  {
    method: 'GET',
    path: '/bases',
    operationId: 'listBases',
    tag: 'Bases',
    summary: 'List the defense bases',
    description:
      'A page of the defense bases of the arsenal (approved ones only: proposals waiting for review or rejected are left out), optionally of one town hall level. Keyset pagination: ask for the next page with the `nextCursor` of the previous one, until it is `null`. Bases added or removed meanwhile neither repeat nor shift other bases between pages.',
    access: 'clan',
    rateLimit: ApiName.BASES_READ,
    query: requestPart(listBasesQuerySchema, {
      th: 'Only the bases of this town hall level, 1–30.',
      limit: 'Bases per page, 1–60 (default 24).',
      cursor: 'The `nextCursor` of the previous page; omit it for the first page.',
    }),
    responses: { 200: { description: 'A page of bases.', result: DefenseBasePage } },
    errors: { 400: [K.INVALID_FIELD] },
  },
  {
    method: 'POST',
    path: '/bases',
    operationId: 'createBase',
    tag: 'Bases',
    summary: 'Add a defense base',
    description: 'Adds a base to the arsenal (at most 400 bases), published at once without moderation.',
    access: 'admin',
    rateLimit: ApiName.BASES_WRITE,
    body: {
      contentType: 'multipart/form-data',
      ...requestPart(createBaseSchema.extend({ image }), {
        layoutUrl: LAYOUT_URL,
        description: DESCRIPTION,
        clanCastleTroops: TROOPS,
        image: IMAGE,
      }),
    },
    responses: {
      201: { description: 'The new base.', result: DefenseBase, messages: [K.BASE_CREATED] },
    },
    errors: {
      400: [...FORM_ERRORS, K.IMAGE_SHOULD_NOT_BE_EMPTY],
      409: [K.BASE_ALREADY_EXISTS, K.BASE_LIMIT_REACHED],
      413: [K.IMAGE_IS_TOO_LARGE],
    },
  },
  {
    method: 'GET',
    path: '/bases/{id}',
    operationId: 'getBase',
    tag: 'Bases',
    summary: 'Get a defense base',
    description: 'One base of the arsenal; proposals not approved are not found.',
    access: 'clan',
    rateLimit: ApiName.BASES_READ,
    params: baseIdPath,
    responses: { 200: { description: 'The base.', result: DefenseBase } },
    errors: { 404: [K.BASE_NOT_FOUND] },
  },
  {
    method: 'PATCH',
    path: '/bases/{id}',
    operationId: 'updateBase',
    tag: 'Bases',
    summary: 'Change a defense base',
    description:
      'Changes a base in any state (also a proposal) without changing its state. Changes only the fields sent; an empty `description` or `[]` as `clanCastleTroops` clears them. A new link also changes the town hall level; a new image replaces the old one.',
    access: 'admin',
    rateLimit: ApiName.BASES_WRITE,
    params: baseIdPath,
    body: {
      contentType: 'multipart/form-data',
      ...requestPart(updateBaseSchema.extend({ image: image.optional() }), {
        layoutUrl: LAYOUT_URL,
        description: DESCRIPTION,
        clanCastleTroops: TROOPS,
        image: IMAGE,
      }),
    },
    responses: {
      200: { description: 'The updated base.', result: DefenseBase, messages: [K.BASE_UPDATED] },
    },
    errors: {
      400: FORM_ERRORS,
      404: [K.BASE_NOT_FOUND],
      409: [K.BASE_ALREADY_EXISTS],
      413: [K.IMAGE_IS_TOO_LARGE],
    },
  },
  {
    method: 'DELETE',
    path: '/bases/{id}',
    operationId: 'deleteBase',
    tag: 'Bases',
    summary: 'Delete a defense base',
    description: 'Deletes the base and its screenshot (also a proposal, in any state).',
    access: 'admin',
    rateLimit: ApiName.BASES_WRITE,
    params: baseIdPath,
    responses: { 200: { description: 'Base deleted.', result: null, messages: [K.BASE_DELETED] } },
    errors: { 404: [K.BASE_NOT_FOUND] },
  },
  {
    method: 'POST',
    path: '/base-proposals',
    operationId: 'proposeBase',
    tag: 'Bases',
    summary: 'Propose a defense base',
    description: `A member proposes a base: it is saved as \`PENDING\` and reaches the arsenal only once an administrator approves it. Same form and checks as \`POST /bases\`. At most ${MAX_OPEN_PROPOSALS} proposals waiting or rejected per member.`,
    access: 'clan',
    rateLimit: ApiName.BASE_PROPOSALS,
    body: {
      contentType: 'multipart/form-data',
      ...requestPart(createBaseSchema.extend({ image }), {
        layoutUrl: LAYOUT_URL,
        description: DESCRIPTION,
        clanCastleTroops: TROOPS,
        image: IMAGE,
      }),
    },
    responses: {
      201: {
        description: 'The proposal, waiting for review.',
        result: BaseProposal,
        messages: [K.BASE_PROPOSED],
      },
    },
    errors: {
      400: [...FORM_ERRORS, K.IMAGE_SHOULD_NOT_BE_EMPTY],
      409: [K.BASE_ALREADY_EXISTS, K.BASE_LIMIT_REACHED, K.BASE_PROPOSAL_LIMIT_REACHED],
      413: [K.IMAGE_IS_TOO_LARGE],
    },
  },
  {
    method: 'GET',
    path: '/base-proposals/mine',
    operationId: 'listMyBaseProposals',
    tag: 'Bases',
    summary: 'List my base proposals',
    description:
      'The proposals of the caller not approved yet: waiting ones first, then rejected ones (with the reason), most recent first. Approved proposals are in the arsenal instead.',
    access: 'clan',
    rateLimit: ApiName.BASES_READ,
    responses: { 200: { description: 'The proposals.', result: z.array(BaseProposal) } },
  },
  {
    method: 'PATCH',
    path: '/base-proposals/{id}',
    operationId: 'updateMyBaseProposal',
    tag: 'Bases',
    summary: 'Change or send again my base proposal',
    description:
      "The author changes a proposal not approved yet, with the form of `PATCH /bases/{id}` (only the fields sent change). A waiting proposal stays waiting; a rejected one is sent again for review (`PENDING`, the rejection cleared), even with no field. Other users' proposals are not found; an approved one cannot change any more (409).",
    access: 'clan',
    rateLimit: ApiName.BASE_PROPOSALS,
    params: baseIdPath,
    body: {
      contentType: 'multipart/form-data',
      ...requestPart(updateBaseSchema.extend({ image: image.optional() }), {
        layoutUrl: LAYOUT_URL,
        description: DESCRIPTION,
        clanCastleTroops: TROOPS,
        image: IMAGE,
      }),
    },
    responses: {
      200: {
        description: 'The proposal, waiting for review.',
        result: BaseProposal,
        messages: [K.BASE_PROPOSAL_UPDATED, K.BASE_PROPOSAL_RESUBMITTED],
      },
    },
    errors: {
      400: FORM_ERRORS,
      404: [K.BASE_NOT_FOUND],
      409: [K.BASE_ALREADY_EXISTS, K.BASE_PROPOSAL_NOT_EDITABLE],
      413: [K.IMAGE_IS_TOO_LARGE],
    },
  },
  {
    method: 'DELETE',
    path: '/base-proposals/{id}',
    operationId: 'withdrawMyBaseProposal',
    tag: 'Bases',
    summary: 'Withdraw my base proposal',
    description: 'The author withdraws a proposal not approved yet; it is deleted with its screenshot.',
    access: 'clan',
    rateLimit: ApiName.BASE_PROPOSALS,
    params: baseIdPath,
    responses: {
      200: {
        description: 'Proposal withdrawn.',
        result: null,
        messages: [K.BASE_PROPOSAL_WITHDRAWN],
      },
    },
    errors: { 404: [K.BASE_NOT_FOUND], 409: [K.BASE_PROPOSAL_NOT_EDITABLE] },
  },
  {
    method: 'GET',
    path: '/base-proposals',
    operationId: 'listBaseProposals',
    tag: 'Bases',
    summary: 'List the base proposals (moderation)',
    description:
      'The bases proposed by the members in one state, with the count of each state. Bases added directly by administrators are not proposals and are not listed.',
    access: 'admin',
    rateLimit: ApiName.BASES_READ,
    query: requestPart(listProposalsQuerySchema, {
      status: '`PENDING` (default), `APPROVED` or `REJECTED`.',
    }),
    responses: { 200: { description: 'The proposals.', result: BaseProposalList } },
    errors: { 400: [K.INVALID_FIELD] },
  },
  {
    method: 'POST',
    path: '/base-proposals/{id}/approve',
    operationId: 'approveBaseProposal',
    tag: 'Bases',
    summary: 'Approve a base proposal',
    description:
      'Publishes a waiting proposal in the arsenal at once, recording the administrator and the time. Only waiting proposals: 409 once approved or rejected (e.g. by another administrator meanwhile).',
    access: 'admin',
    rateLimit: ApiName.BASES_WRITE,
    params: baseIdPath,
    responses: {
      200: {
        description: 'The approved proposal.',
        result: BaseProposal,
        messages: [K.BASE_APPROVED],
      },
    },
    errors: { 404: [K.BASE_NOT_FOUND], 409: [K.BASE_PROPOSAL_NOT_PENDING] },
  },
  {
    method: 'POST',
    path: '/base-proposals/{id}/reject',
    operationId: 'rejectBaseProposal',
    tag: 'Bases',
    summary: 'Reject a base proposal',
    description:
      'Refuses a waiting proposal, recording the administrator, the time and the reason, which is shown to the author. The base stays out of the arsenal; its author can correct it and send it again.',
    access: 'admin',
    rateLimit: ApiName.BASES_WRITE,
    params: baseIdPath,
    body: requestPart(rejectProposalSchema, {
      reason: {
        description: 'Why it is rejected, 1–500 characters.',
        example: 'Screenshot cut: show the whole village.',
      },
    }),
    responses: {
      200: {
        description: 'The rejected proposal.',
        result: BaseProposal,
        messages: [K.BASE_REJECTED],
      },
    },
    errors: {
      400: [K.INVALID_JSON, K.REJECTION_REASON_SHOULD_NOT_BE_EMPTY, K.REJECTION_REASON_IS_TOO_LONG],
      404: [K.BASE_NOT_FOUND],
      409: [K.BASE_PROPOSAL_NOT_PENDING],
    },
  },
  {
    method: 'GET',
    path: '/base-images/{key}/{variant}',
    operationId: 'getBaseImage',
    tag: 'Bases',
    summary: 'Get the screenshot of a base',
    description:
      'The screenshot of a defense base as WebP. No authentication, because `<img>` cannot send the access token: the key is random and only appears in the protected list of bases. A new image gets a new key, so responses are cached forever (`Cache-Control: immutable`); only this site may embed them (`Cross-Origin-Resource-Policy: same-origin`).',
    access: 'public',
    rateLimit: ApiName.BASE_IMAGES,
    params: requestPart(z.object({ key: z.string(), variant: z.enum(['thumb', 'full']) }), {
      key: {
        description: 'Image key, from `DefenseBase.image.key`.',
        example: 'q1w2e3r4t5y6u7i8o9p0a1s2',
      },
      variant: '`thumb` (640 px) or `full` (1400 px, longest side).',
    }),
    responses: { 200: { description: 'The image.', result: null, binary: IMAGE_CONTENT_TYPE } },
    errors: { 404: [K.NOT_FOUND] },
  },
];
