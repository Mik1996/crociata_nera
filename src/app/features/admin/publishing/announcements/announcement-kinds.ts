import { AnnouncementKind } from '../../../../core/backend/backend-api.types';
import { IconName } from '../../../../shared/components/icon/icon-names';

/** Icon of each kind of announcement (drafts, history, settings). */
export const KIND_ICONS: Record<AnnouncementKind, IconName> = {
  month: 'calendar_month',
  cwl: 'emoji_events',
  donations: 'volunteer_activism',
  record: 'local_fire_department',
  promotion: 'workspace_premium',
  legendSeason: 'emoji_events',
  war: 'flag',
  raid: 'castle',
  lineup: 'groups',
};
