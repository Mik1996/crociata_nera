import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  resource,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import { TranslatePipe } from '@ngx-translate/core';
import { CLAN_CREST_URL } from '../../../core/api/clan-badge';
import { APP_CONFIG } from '../../../core/config/app-config';
import { LanguageService } from '../../../core/i18n/language.service';
import { CommendationTier, CommendationType } from '../../../core/models';
import { emblemOf, nameKeyOf, styleOf, thresholdOf } from '../../../core/utils/commendations';
import { Icon } from '../../../shared/components/icon/icon';
import { MedalSnapshots } from '../../../shared/medal-3d/medal-snapshots.service';
import {
  hashtagOf,
  SHARE_CARD_SIZES,
  SHARE_SITE,
  shareCardFileName,
  ShareCardFormat,
} from '../../../shared/share-card/share-card';
import { ShareCardRenderer } from '../../../shared/share-card/share-card-renderer';

export interface CommendationShareData {
  type: CommendationType;
  tier: CommendationTier | null;
  /** In-game name of the player who earned it (the signed-in user's own account). */
  player: string;
  /** When or how many times, already translated: printed on the card and in the caption. */
  detail: string;
}

/** How long the messages stay on screen. */
const MESSAGE_MS = 4000;

/**
 * "Share your achievement": a picture of the medal (square for posts and chats, or a story) with a
 * caption, sent to an app through the system's share sheet, downloaded, or the caption copied.
 * Offered only to the player who earned the medal (`CommendationDialog`).
 */
@Component({
  selector: 'crn-commendation-share-dialog',
  imports: [MatDialogModule, MatButtonModule, MatProgressSpinnerModule, TranslatePipe, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './commendation-share-dialog.html',
  styleUrl: './commendation-share-dialog.scss',
})
export class CommendationShareDialog {
  protected readonly data = inject<CommendationShareData>(MAT_DIALOG_DATA);
  private readonly language = inject(LanguageService);
  private readonly config = inject(APP_CONFIG);
  private readonly snapshots = inject(MedalSnapshots);
  private readonly renderer = inject(ShareCardRenderer);
  private readonly snackBar = inject(MatSnackBar);

  protected readonly formats: readonly ShareCardFormat[] = ['square', 'story'];
  protected readonly format = signal<ShareCardFormat>('square');
  protected readonly canShare = canSharePng();
  protected readonly canCopyImage = canCopyPng();
  protected readonly busy = signal(false);

  /** Name of the medal with its tier, e.g. "Warlord – Gold". */
  private readonly medalName = computed(() => {
    const name = this.language.t(nameKeyOf(this.data));
    return this.data.tier
      ? `${name} – ${this.language.t('commendations.tiers.' + this.data.tier)}`
      : name;
  });

  /** Caption to paste with the picture: what, when, the site and the hashtags. */
  protected readonly caption = computed(() =>
    [
      this.language.t('commendations.share.caption', {
        medal: this.medalName(),
        clan: this.config.clanName,
      }),
      this.data.detail,
      `https://${SHARE_SITE}`,
      `${hashtagOf(this.config.clanName)} #ClashOfClans`,
    ].join('\n'),
  );

  /** The card of the chosen format, drawn again when the format changes. */
  protected readonly card = resource({
    params: () => ({ format: this.format(), language: this.language.current() }),
    loader: async ({ params }) => {
      const blob = await this.draw(params.format);
      const file = new File([blob], shareCardFileName(this.config.clanName, emblemOf(this.data), params.format), {
        type: 'image/png',
      });
      // The previous picture is released a moment later, once the preview has let it go.
      const old = this.previewUrl;
      this.previewUrl = URL.createObjectURL(blob);
      if (old) setTimeout(() => URL.revokeObjectURL(old), 1000);
      return { file, url: this.previewUrl };
    },
  });

  /** Aspect ratio of the preview box, kept while a format is being drawn. */
  protected readonly ratio = computed(() => {
    const { width, height } = SHARE_CARD_SIZES[this.format()];
    return `${width} / ${height}`;
  });

  private previewUrl: string | null = null;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.revoke());
  }

  protected async share(): Promise<void> {
    const card = this.card.hasValue() ? this.card.value() : null;
    if (!card || this.busy()) return;
    this.busy.set(true);
    try {
      // Only the picture: with a text too, apps like Telegram keep the text and drop the picture.
      // The caption has its own "Copy text".
      await navigator.share({ files: [card.file] });
    } catch (error) {
      const name = (error as DOMException | null)?.name;
      if (name !== 'AbortError') {
        console.error('[share] failed', error);
        this.message('commendations.share.shareError');
      }
    } finally {
      this.busy.set(false);
    }
  }

  protected download(): void {
    const card = this.card.hasValue() ? this.card.value() : null;
    if (!card) return;
    const link = document.createElement('a');
    link.href = card.url;
    link.download = card.file.name;
    link.click();
  }

  /**
   * Puts the picture alone on the clipboard, to paste it in a chat. The "Copy" of the macOS share
   * sheet stores it both as image data and as a file, and apps like WhatsApp paste it twice.
   */
  protected async copyImage(): Promise<void> {
    const card = this.card.hasValue() ? this.card.value() : null;
    if (!card) return;
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': card.file })]);
      this.message('commendations.share.imageCopied');
    } catch (error) {
      console.error('[share] image copy failed', error);
      this.message('commendations.share.copyImageError');
    }
  }

  protected async copyCaption(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.caption());
      this.message('commendations.share.copied');
    } catch {
      this.message('commendations.share.copyError');
    }
  }

  private async draw(format: ShareCardFormat) {
    const t = (key: string, params?: Record<string, unknown>) => this.language.t(key, params);
    const emblem = emblemOf(this.data);
    const medalSvg = `commendations/${emblem}.svg`;
    const { width } = SHARE_CARD_SIZES[format];
    // The 3D medal as wide as on the card (two thirds of the story, 37% of the square).
    const medal3d = await this.snapshots.still(
      medalSvg,
      styleOf(this.data),
      Math.round(width * (format === 'story' ? 0.65 : 0.37)),
    );
    const tier = this.data.tier;
    return this.renderer.render({
      format,
      kicker: t('commendations.share.kicker'),
      title: t(nameKeyOf(this.data)),
      tier: tier ? { label: t('commendations.tiers.' + tier), metal: tier } : null,
      medalSvg,
      medal3d,
      player: this.data.player,
      detail: this.data.detail,
      description: t(`commendations.${this.data.type}.description`, {
        n: thresholdOf(this.data)?.toLocaleString(this.language.current()),
      }),
      clan: this.config.clanName,
      crest: CLAN_CREST_URL,
      fanContent: t('pdf.fanContent'),
    });
  }

  private message(key: string): void {
    this.snackBar.open(this.language.t(key), undefined, { duration: MESSAGE_MS });
  }

  private revoke(): void {
    if (this.previewUrl) URL.revokeObjectURL(this.previewUrl);
    this.previewUrl = null;
  }
}

/** Whether the browser can put a PNG picture on the clipboard (async Clipboard API). */
function canCopyPng(): boolean {
  if (typeof navigator === 'undefined' || typeof navigator.clipboard?.write !== 'function') return false;
  if (typeof ClipboardItem === 'undefined') return false;
  // `supports` is recent: where it is missing, PNG is the one picture type every browser accepts.
  return typeof ClipboardItem.supports !== 'function' || ClipboardItem.supports('image/png');
}

/** Whether the device can share a picture file (Web Share API level 2). */
function canSharePng(): boolean {
  if (typeof navigator === 'undefined' || typeof navigator.canShare !== 'function') return false;
  try {
    return navigator.canShare({ files: [new File([''], 'card.png', { type: 'image/png' })] });
  } catch {
    return false;
  }
}
