import { HydratedDocument, InferSchemaType, model, models, Model, Schema } from 'mongoose';

/**
 * What an announcement tells: the month of a clan (wars, Raid Weekends and the commendations of the
 * month), a Clan War League season, the donations of a game season, a new record of the clan, or a
 * player promoted to a league never reached before (Electro League 31 and up), or a player who ended
 * a Legend League season in Legend League I (among the first 10,000 of the world), the result of a
 * war, a Raid Weekend.
 */
export const AnnouncementKind = {
  MONTH: 'month',
  CWL: 'cwl',
  DONATIONS: 'donations',
  RECORD: 'record',
  PROMOTION: 'promotion',
  LEGEND_SEASON: 'legendSeason',
  WAR: 'war',
  RAID: 'raid',
} as const;
export type AnnouncementKind = (typeof AnnouncementKind)[keyof typeof AnnouncementKind];
export const ANNOUNCEMENT_KINDS = Object.values(AnnouncementKind);

/**
 * `draft`: prepared by the backend, waiting for an administrator (its figures are brought up to date
 * at every sync); `publishing`: being sent to Telegram; `published`: in the announcements channel,
 * frozen; `discarded`: dropped by an administrator.
 */
export const AnnouncementState = {
  DRAFT: 'draft',
  PUBLISHING: 'publishing',
  PUBLISHED: 'published',
  DISCARDED: 'discarded',
} as const;
export type AnnouncementState = (typeof AnnouncementState)[keyof typeof AnnouncementState];
export const ANNOUNCEMENT_STATES = Object.values(AnnouncementState);

/**
 * An announcement for the Telegram announcements channel: prepared by the backend when something
 * happens (a period closes, a record falls), published or discarded by an administrator from the site.
 */
const announcementSchema = new Schema(
  {
    /**
     * Unique: `month:2026-11@#TAG`, `cwl:2026-11@#TAG`, `donations:2026-11@#TAG`; records carry their
     * value (`record:warWinStreak:57@#TAG`), which changes while the draft follows the record;
     * promotions the player and the league (`promotion:#PLAYER:105000032`), same; wars their key
     * (`war:20261119T213344-JPLL8YGG@#TAG`), Raid Weekends their start (`raid:2026-11-13T07:00:00.000Z@#TAG`).
     */
    key: { type: String, required: true, unique: true },
    kind: { type: String, enum: ANNOUNCEMENT_KINDS, required: true },
    clanTag: { type: String, required: true },
    /**
     * Period (`2026-11`), record name (`warWinStreak`), player tag (promotions), war key (wars) or
     * start of the weekend (Raid Weekends, ISO).
     */
    subject: { type: String, required: true },
    state: { type: String, enum: ANNOUNCEMENT_STATES, required: true, default: AnnouncementState.DRAFT },
    /** Figures of the announcement (`AnnouncementData`), drawn in the pictures and the caption. */
    data: { type: Schema.Types.Mixed, required: true },
    /** Caption written by an administrator; `null`: the generated one. */
    caption: { type: String, default: null },
    /**
     * A publication was interrupted (still `publishing` after 10 minutes): the post may have reached
     * Telegram anyway, so the draft is back with this flag for an administrator to check the channel.
     */
    interrupted: { type: Boolean, default: false },
    /** Last failure of a publication (Telegram's words). */
    error: { type: String, default: null },
    publishedAt: { type: Date, default: null },
    /** Language it was published in (`it-IT`, `en-US`, `es-ES`); `null` while not published. */
    language: { type: String, default: null },
    chatId: { type: Number, default: null },
    messageIds: { type: [Number], default: [] },
    /** Who published or discarded it (user id). */
    decidedBy: { type: String, default: null },
  },
  { collection: 'Announcements', timestamps: true, versionKey: false },
);
announcementSchema.index({ state: 1, createdAt: -1 });
// One open draft per record of a clan: it follows the record until it is published or discarded.
announcementSchema.index(
  { kind: 1, clanTag: 1, subject: 1 },
  { unique: true, partialFilterExpression: { kind: AnnouncementKind.RECORD, state: AnnouncementState.DRAFT } },
);

// One open draft per player: a player promoted again before it is published gets it updated.
announcementSchema.index(
  { kind: 1, subject: 1 },
  { unique: true, partialFilterExpression: { kind: AnnouncementKind.PROMOTION, state: AnnouncementState.DRAFT } },
);

export type Announcement = InferSchemaType<typeof announcementSchema>;
export type AnnouncementDocument = HydratedDocument<Announcement>;

export const AnnouncementModel: Model<Announcement> =
  (models.Announcement as Model<Announcement>) ?? model<Announcement>('Announcement', announcementSchema);

/**
 * Where the announcements of a clan start: periods closed before `since` get none, and a record
 * is announced only when it beats the value here (the value when the clan was first seen, then the
 * value of the last record announcement published or discarded).
 */
const announcementBaselineSchema = new Schema(
  {
    clanTag: { type: String, required: true, unique: true },
    since: { type: Date, required: true },
    /**
     * Start of the kinds added later (`war`, `raid`), set the first time they are looked for: the
     * wars and Raid Weekends ended before get no draft (`since` would bring back the whole past).
     */
    kindsSince: { type: Schema.Types.Mixed, default: null },
    /** Record name -> value (league id for `cwlLeague`). */
    records: { type: Schema.Types.Mixed, default: null },
  },
  { collection: 'AnnouncementBaselines', versionKey: false },
);

export type AnnouncementBaseline = InferSchemaType<typeof announcementBaselineSchema>;

export const AnnouncementBaselineModel: Model<AnnouncementBaseline> =
  (models.AnnouncementBaseline as Model<AnnouncementBaseline>) ??
  model<AnnouncementBaseline>('AnnouncementBaseline', announcementBaselineSchema);

/**
 * Highest home village league (`leagueTier`, the id grows with the league) each player was seen in
 * while in a clan of the Crusade: a promotion is announced only when it beats this (Legend League I,
 * the top, at every arrival: `lastLeagueId`). The first time a player is seen, the current league is
 * the starting point (not news).
 */
const playerLeagueBestSchema = new Schema(
  {
    playerTag: { type: String, required: true, unique: true },
    leagueId: { type: Number, required: true },
    leagueName: { type: String, required: true },
    reachedAt: { type: Date, required: true },
    /** League of the last read (`null`: saved before it was tracked). */
    lastLeagueId: { type: Number, default: null },
  },
  { collection: 'PlayerLeagueBests', versionKey: false },
);

export const PlayerLeagueBestModel: Model<InferSchemaType<typeof playerLeagueBestSchema>> =
  (models.PlayerLeagueBest as Model<InferSchemaType<typeof playerLeagueBestSchema>>) ??
  model('PlayerLeagueBest', playerLeagueBestSchema);

/**
 * Kinds of announcement whose drafts the backend prepares, set by the administrators (one document,
 * `key: 'kinds'`). A kind missing from `kinds` is on. A kind turned off gets no new drafts, and what
 * happens while it is off is not announced later: turned on again, it starts from `changedAt`.
 */
const announcementSettingsSchema = new Schema(
  {
    key: { type: String, required: true, unique: true },
    /** Kind -> `{ enabled, changedAt }` (no default: kinds are set one by one, `kinds.<kind>`). */
    kinds: { type: Schema.Types.Mixed },
  },
  { collection: 'AnnouncementSettings', versionKey: false },
);

export const AnnouncementSettingsModel: Model<InferSchemaType<typeof announcementSettingsSchema>> =
  (models.AnnouncementSettings as Model<InferSchemaType<typeof announcementSettingsSchema>>) ??
  model('AnnouncementSettings', announcementSettingsSchema);
