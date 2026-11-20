import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { TranslatePipe } from '@ngx-translate/core';
import { AnnouncementsAdminService } from '../../../../core/backend/announcements-admin.service';
import {
  Announcement,
  AnnouncementKind,
  BackendMessage,
} from '../../../../core/backend/backend-api.types';
import { backendErrors } from '../../../../core/backend/backend-errors';
import { PendingPublications } from '../../../../core/backend/pending-publications';
import { LanguageService } from '../../../../core/i18n/language.service';
import {
  formatLocalDate,
  formatLocalNumber,
  LocalDatePipe,
} from '../../../../core/i18n/locale-pipes';
import { Alert } from '../../../../shared/components/alert/alert';
import { Icon } from '../../../../shared/components/icon/icon';
import { IconName } from '../../../../shared/components/icon/icon-names';
import { LoadState } from '../../../../shared/components/load-state/load-state';
import { Tag, TagTone } from '../../../../shared/components/tag/tag';
import {
  AnnouncementDecisionDialog,
  AnnouncementDecisionData,
} from './announcement-decision-dialog';
import { AnnouncementImages } from './announcement-images';

/** Telegram's limit for the caption of a picture (visible characters). */
export const CAPTION_LIMIT = 1024;

/**
 * Length of a caption as Telegram counts it: visible text (the `**` of the bold parts are not
 * shown), in UTF-16 units (an emoji counts 2). Same rule as the backend.
 */
export function captionLength(caption: string): number {
  return caption.replace(/\*\*(.+?)\*\*/gs, '$1').length;
}

const KIND_ICONS: Record<AnnouncementKind, IconName> = {
  month: 'calendar_month',
  cwl: 'emoji_events',
  donations: 'volunteer_activism',
  record: 'local_fire_department',
  promotion: 'workspace_premium',
  legendSeason: 'emoji_events',
};

const STATE_TONES: Record<Announcement['state'], TagTone> = {
  draft: 'gold',
  publishing: 'gold',
  published: 'success',
  discarded: 'neutral',
};

const DIALOG_CONFIG = {
  width: '28rem',
  maxWidth: 'calc(100vw - 2rem)',
  autoFocus: 'first-tabbable',
} as const;

/**
 * Announcements tab of the Publications page (administrators). The backend prepares a draft when a month
 * closes, a Clan War League or game season ends, or a record of a clan of the Crusade falls; here
 * the drafts are looked at (pictures and caption), the caption changed, then published or discarded.
 */
@Component({
  selector: 'crn-telegram-announcements',
  imports: [
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    TranslatePipe,
    Alert,
    AnnouncementImages,
    Icon,
    LoadState,
    LocalDatePipe,
    Tag,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './telegram-announcements.html',
  styleUrl: './telegram-announcements.scss',
})
export class TelegramAnnouncements {
  private readonly service = inject(AnnouncementsAdminService);
  private readonly language = inject(LanguageService);
  private readonly dialog = inject(MatDialog);

  protected readonly limit = CAPTION_LIMIT;
  /** When the backend prepares a draft (`announcementsAdmin.intro.cases.*`). */
  protected readonly introCases = ['period', 'record', 'league', 'legend'] as const;
  protected readonly kindIcons = KIND_ICONS;
  protected readonly stateTones = STATE_TONES;

  /** Reloaded when the language changes: generated captions and pictures come in it. */
  protected readonly announcements = rxResource({
    params: () => this.language.current(),
    stream: ({ params: lang }) => this.service.list(lang),
  });
  private readonly items = computed(() =>
    this.announcements.hasValue() ? this.announcements.value() : [],
  );
  protected readonly drafts = computed(() =>
    this.items().filter((a) => a.state === 'draft' || a.state === 'publishing'),
  );
  protected readonly decided = computed(() =>
    this.items().filter((a) => a.state === 'published' || a.state === 'discarded'),
  );

  constructor() {
    // The badges (menu, tab) follow the drafts read here.
    const pending = inject(PendingPublications);
    effect(() => {
      if (this.announcements.hasValue()) {
        pending.set('announcements', this.items().filter((a) => a.state === 'draft').length);
      }
    });
  }

  /** Captions being written, by announcement id (until saved). */
  private readonly edits = signal<Record<string, string>>({});
  /** Announcement whose caption is being saved. */
  protected readonly saving = signal<string | null>(null);
  protected readonly feedback = signal<{
    kind: 'success' | 'error';
    messages: BackendMessage[];
  } | null>(null);

  /** "Crociata Nera · Novembre 2026", "Crociata Rossa · Serie di vittorie: 57". */
  protected title(a: Announcement): string {
    if (a.kind === 'legendSeason') {
      const detail = this.language.t('announcementsAdmin.legendSeason', {
        player: a.playerName,
        trophies: formatLocalNumber(a.value ?? 0, this.language.current()),
      });
      return `${a.clanName} · ${detail}`;
    }
    if (a.kind === 'promotion') {
      const detail = this.language.t('announcementsAdmin.promotion', {
        player: a.playerName,
        league: this.leagueLabel(a.leagueName ?? ''),
      });
      return `${a.clanName} · ${detail}`;
    }
    const detail =
      a.kind === 'record'
        ? this.language.t(`announcementsAdmin.records.${a.subject}`, {
            value: a.value,
            league: a.leagueName,
          })
        : this.monthLabel(a.subject);
    return `${a.clanName} · ${detail}`;
  }

  /** `Electro League 32` in the language of the page (`Lega Elettro 32`); unknown names as they are. */
  private leagueLabel(name: string): string {
    const match = /^(Electro|Legend|Dragon) League (\S+)$/.exec(name);
    if (!match) return name;
    return this.language.t('announcementsAdmin.league', {
      family: this.language.t(`announcementsAdmin.leagueFamily.${match[1]}`),
      division: match[2],
    });
  }

  private monthLabel(month: string): string {
    const label = formatLocalDate(`${month}-15T12:00:00`, 'LLLL yyyy', this.language.current());
    return label.charAt(0).toUpperCase() + label.slice(1);
  }

  protected captionOf(a: Announcement): string {
    return this.edits()[a.id] ?? a.caption;
  }

  protected edited(a: Announcement): boolean {
    const text = this.edits()[a.id];
    return text !== undefined && text.trim() !== a.caption;
  }

  protected length(a: Announcement): number {
    return captionLength(this.captionOf(a).trim());
  }

  protected tooLong(a: Announcement): boolean {
    return this.length(a) > CAPTION_LIMIT;
  }

  protected write(a: Announcement, text: string): void {
    this.edits.update((edits) => ({ ...edits, [a.id]: text }));
  }

  /** Saves the caption written; `reset` goes back to the generated one. */
  protected saveCaption(a: Announcement, reset = false): void {
    const caption = reset ? null : this.captionOf(a).trim();
    if (!reset && (!caption || this.tooLong(a))) return;
    this.saving.set(a.id);
    this.feedback.set(null);
    this.service.updateCaption(a.id, caption, this.language.current()).subscribe({
      next: (updated) => {
        this.replace(updated);
        this.forget(a.id);
        this.saving.set(null);
        this.feedback.set({ kind: 'success', messages: [{ key: 'SUCCESS.ANNOUNCEMENT_UPDATED' }] });
      },
      error: (error: unknown) => {
        const { fields, general } = backendErrors(error);
        this.feedback.set({ kind: 'error', messages: [...general, ...fields] });
        this.saving.set(null);
      },
    });
  }

  /** Publishes or discards, after confirmation (unsaved caption changes are saved first). */
  protected decide(a: Announcement, action: AnnouncementDecisionData['action']): void {
    if (action === 'publish' && this.edited(a)) {
      this.feedback.set({ kind: 'error', messages: [{ key: 'announcementsAdmin.saveFirst' }] });
      return;
    }
    this.feedback.set(null);
    this.dialog
      .open<AnnouncementDecisionDialog, AnnouncementDecisionData, Announcement>(
        AnnouncementDecisionDialog,
        { ...DIALOG_CONFIG, data: { announcement: a, title: this.title(a), action } },
      )
      .afterClosed()
      .subscribe((updated) => {
        if (!updated) {
          // A failed publication leaves the draft with Telegram's error.
          if (action === 'publish') this.announcements.reload();
          return;
        }
        this.replace(updated);
        this.forget(a.id);
        this.feedback.set({
          kind: 'success',
          messages: [
            {
              key:
                action === 'publish'
                  ? 'SUCCESS.ANNOUNCEMENT_PUBLISHED'
                  : 'SUCCESS.ANNOUNCEMENT_DISCARDED',
            },
          ],
        });
      });
  }

  private replace(updated: Announcement): void {
    this.announcements.update((list) => list?.map((a) => (a.id === updated.id ? updated : a)));
  }

  private forget(id: string): void {
    this.edits.update(({ [id]: _, ...rest }) => rest);
  }
}
