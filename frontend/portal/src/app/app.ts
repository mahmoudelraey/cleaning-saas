import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import { Toasts } from './core/toast';

@Component({
  selector: 'pt-root',
  imports: [RouterOutlet, Toasts],
  template: `<router-outlet /><pt-toasts />`,
})
export class App {}
