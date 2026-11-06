import { ChangeDetectionStrategy, Component } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';

@Component({
  selector: 'app-not-found-page',
  imports: [RouterLink, MatButtonModule, MatIconModule, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="cn-card cn-section" style="text-align: center; padding: 3rem 1rem">
      <h1 style="color: var(--cn-gold-light); margin-top: 0">{{ 'notFound.title' | translate }}</h1>
      <p class="cn-muted">{{ 'notFound.text' | translate }}</p>
      <a mat-flat-button routerLink="/dashboard">
        <mat-icon aria-hidden="true">home</mat-icon> {{ 'notFound.back' | translate }}
      </a>
    </section>
  `,
})
export class NotFoundPage {}
