import { z } from 'zod';
import { TROOP_NAMES } from '@/modules/bases/clan-castle';
import { dateTime, model } from './common';

export const ClanCastleTroop = model(
  'ClanCastleTroop',
  'Clan castle reinforcements recommended for a base.',
  z.strictObject({
    name: z.enum(TROOP_NAMES).describe('Troop, by its English name in the Clash of Clans API.'),
    count: z.number().int().min(1).describe('How many.'),
  }),
);

export const DefenseBase = model(
  'DefenseBase',
  'A defense base of the arsenal. Its screenshot is at `GET /base-images/{image.key}/thumb` (640 px) and `/full` (1400 px).',
  z.strictObject({
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
  }),
);

export const DefenseBasePage = model(
  'DefenseBasePage',
  'A page of the arsenal.',
  z.strictObject({
    items: z
      .array(DefenseBase)
      .describe('Bases of the page: highest town hall first, then the most recently changed.'),
    nextCursor: z
      .string()
      .nullable()
      .describe('Pass it as `cursor` to get the next page; `null` on the last page.'),
    townHallLevels: z
      .array(z.number().int())
      .describe('Town hall levels with at least one base (whatever the filter), highest first.'),
  }),
);
