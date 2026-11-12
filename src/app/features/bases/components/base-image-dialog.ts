import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { TranslatePipe } from '@ngx-translate/core';
import { DefenseBase } from '../../../core/backend/backend-api.types';

export interface BaseImageDialogData {
  base: DefenseBase;
  /** Full-size screenshot. */
  imageUrl: string;
}

/** Enlarged screenshot of a base, with its description and the "copy base" link. */
@Component({
  selector: 'app-base-image-dialog',
  imports: [MatButtonModule, MatDialogModule, MatIconModule, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './base-image-dialog.html',
  styleUrl: './base-image-dialog.scss',
})
export class BaseImageDialog {
  protected readonly data = inject<BaseImageDialogData>(MAT_DIALOG_DATA);
}
