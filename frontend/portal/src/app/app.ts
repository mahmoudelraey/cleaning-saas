import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import { Toasts } from './core/toast';

@Component({
  selector: 'pt-root',
  imports: [RouterOutlet, Toasts],
  templateUrl: './app.html',
})
export class App {}
