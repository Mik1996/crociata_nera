import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslatePipe } from '@ngx-translate/core';
import { TelegramChat } from '../../../../core/backend/backend-api.types';
import { CLAN_CASTLE_CAPACITY } from '../../../../core/game/clan-castle';
import { TOWN_HALL_IMAGES } from '../../../../core/game/game-assets';
import { LanguageService } from '../../../../core/i18n/language.service';
import { Icon } from '../../../../shared/components/icon/icon';
import { Select, SelectOption } from '../../../../shared/components/select/select';
import { Tag } from '../../../../shared/components/tag/tag';
import { ANNOUNCEMENTS_PURPOSE, TelegramAdminState } from '../telegram-admin-state';

/** Value of the content choice meaning "nothing": no town hall, not the announcements. */
const NO_CONTENT = 0;
/** What a chat receives: nothing, the announcements, or the bases of a town hall level. */
type ChatContent = typeof NO_CONTENT | typeof ANNOUNCEMENTS_PURPOSE | number;
/** Lowest town hall offered: below it there are no war bases worth sharing. */
const LOWEST_TOWN_HALL = 3;

/**
 * "Bot and channels" tab of the Telegram page (administrators), the only place where the channels
 * are managed: the bot, every chat it was seen in and what it receives (the announcements or the
 * bases of a town hall), to lock, forget or add.
 */
@Component({
  selector: 'crn-telegram-bot',
  imports: [
    FormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSlideToggleModule,
    MatTooltipModule,
    TranslatePipe,
    Icon,
    Select,
    Tag,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './telegram-bot.html',
  styleUrl: './telegram-bot.scss',
})
export class TelegramBot {
  protected readonly state = inject(TelegramAdminState);
  private readonly language = inject(LanguageService);
  protected readonly newChat = signal('');

  /** Town halls offered for a chat: from one above the highest known down. */
  private readonly levels = (() => {
    const highest = Math.max(...Object.keys(CLAN_CASTLE_CAPACITY).map(Number)) + 1;
    return Array.from({ length: highest - LOWEST_TOWN_HALL + 1 }, (_, i) => highest - i);
  })();

  /**
   * Choices of a chat: nothing, the announcements (when no other chat has them) and the town halls
   * not taken by another chat. The announcements chat is offered no town hall: it must go back to
   * "nothing" first, so that bases never reach it by mistake.
   */
  protected contentOptions(chat: TelegramChat): SelectOption<ChatContent>[] {
    const others = this.state.chats().filter((c) => c.chatId !== chat.chatId);
    const taken = new Set(others.map((c) => c.townHallLevel).filter((level) => level !== null));
    const options: SelectOption<ChatContent>[] = [
      { value: NO_CONTENT, label: this.language.t('telegramAdmin.chats.noTownHall') },
    ];
    if (!others.some((c) => c.purpose === ANNOUNCEMENTS_PURPOSE)) {
      options.push({
        value: ANNOUNCEMENTS_PURPOSE,
        label: this.language.t('telegramAdmin.chats.announcements'),
        icon: 'campaign',
      });
    }
    if (chat.purpose === ANNOUNCEMENTS_PURPOSE) return options;
    return [
      ...options,
      ...this.levels
        .filter((level) => !taken.has(level))
        .map((level) => ({ value: level, label: `TH${level}`, image: TOWN_HALL_IMAGES[level] })),
    ];
  }

  protected contentOf(chat: TelegramChat): ChatContent {
    if (chat.purpose === ANNOUNCEMENTS_PURPOSE) return ANNOUNCEMENTS_PURPOSE;
    return chat.townHallLevel ?? NO_CONTENT;
  }

  protected setContent(chat: TelegramChat, value: ChatContent | undefined): void {
    if (value === undefined || value === this.contentOf(chat)) return;
    this.state.setContent(
      chat,
      value === ANNOUNCEMENTS_PURPOSE
        ? { purpose: ANNOUNCEMENTS_PURPOSE, townHallLevel: null }
        : { purpose: 'bases', townHallLevel: value || null },
    );
  }

  protected addChat(): void {
    const chat = this.newChat().trim();
    if (chat) this.state.addChat(chat, () => this.newChat.set(''));
  }
}
