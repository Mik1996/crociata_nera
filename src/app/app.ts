import { ChangeDetectionStrategy, Component } from '@angular/core';
import { Shell } from './layout/shell';

@Component({
  selector: 'crn-root',
  imports: [Shell],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {}
