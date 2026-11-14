import {
  ChangeDetectionStrategy,
  Component,
  computed,
  forwardRef,
  input,
  signal,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { Icon } from '../../../shared/icon/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslatePipe } from '@ngx-translate/core';
import {
  CLAN_CASTLE_TROOPS,
  ClanCastleTroop,
  housingSpaceUsed,
  troopInfo,
  TroopGroup,
  TroopInfo,
} from '../../../core/game/clan-castle';

const GROUPS: TroopGroup[] = ['elixir', 'dark', 'super'];

/**
 * Picks the clan castle reinforcements of a base from the troop pictures, as a form control
 * (value: `ClanCastleTroop[]`). A click on a troop adds one; a click on a chosen troop takes one
 * away. Troops that no longer fit in the free space are disabled, so the castle cannot overflow;
 * without a capacity (town hall still unknown) nothing can be picked.
 */
@Component({
  selector: 'crn-clan-castle-picker',
  imports: [MatButtonModule, Icon, MatTooltipModule, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    { provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => ClanCastlePicker), multi: true },
  ],
  templateUrl: './clan-castle-picker.html',
  styleUrl: './clan-castle-picker.scss',
})
export class ClanCastlePicker implements ControlValueAccessor {
  /** Housing space of the castle; `null` while the town hall is not known. */
  readonly capacity = input<number | null>(null);

  protected readonly troops = signal<ClanCastleTroop[]>([]);
  protected readonly disabled = signal(false);
  protected readonly used = computed(() => housingSpaceUsed(this.troops()));
  protected readonly free = computed(() => Math.max(0, (this.capacity() ?? 0) - this.used()));
  /** The town hall changed to one with a smaller castle: some troops must go. */
  protected readonly over = computed(() => {
    const capacity = this.capacity();
    return capacity !== null && this.used() > capacity;
  });
  protected readonly fill = computed(() => {
    const capacity = this.capacity();
    return capacity ? Math.min(100, (this.used() / capacity) * 100) : 0;
  });
  protected readonly chosen = computed(() =>
    this.troops().map((troop) => ({ ...troop, info: troopInfo(troop.name) })),
  );
  protected readonly groups = GROUPS.map((group) => ({
    group,
    troops: CLAN_CASTLE_TROOPS.filter((troop) => troop.group === group),
  }));

  private onChange: (value: ClanCastleTroop[]) => void = () => undefined;
  private onTouched: () => void = () => undefined;

  protected fits(troop: TroopInfo): boolean {
    return !this.disabled() && this.capacity() !== null && troop.housingSpace <= this.free();
  }

  protected add(troop: TroopInfo): void {
    if (!this.fits(troop)) return;
    const troops = this.troops();
    const current = troops.find((t) => t.name === troop.name);
    this.update(
      current
        ? troops.map((t) => (t === current ? { ...t, count: t.count + 1 } : t))
        : [...troops, { name: troop.name, count: 1 }],
    );
  }

  protected removeOne(name: string): void {
    if (this.disabled()) return;
    this.update(
      this.troops()
        .map((t) => (t.name === name ? { ...t, count: t.count - 1 } : t))
        .filter((t) => t.count > 0),
    );
  }

  protected clear(): void {
    if (!this.disabled()) this.update([]);
  }

  protected initials(name: string): string {
    return name
      .split(/\s+/)
      .map((word) => word[0])
      .join('')
      .slice(0, 2)
      .toUpperCase();
  }

  private update(troops: ClanCastleTroop[]): void {
    this.troops.set(troops);
    this.onChange(troops);
    this.onTouched();
  }

  writeValue(value: ClanCastleTroop[] | null): void {
    this.troops.set(value ?? []);
  }

  registerOnChange(fn: (value: ClanCastleTroop[]) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(disabled: boolean): void {
    this.disabled.set(disabled);
  }
}
