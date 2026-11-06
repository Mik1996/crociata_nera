import { ChangeDetectionStrategy, Component } from '@angular/core';
import { Shell } from './layout/shell';

@Component({
  selector: 'app-root',
  imports: [Shell],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {}
