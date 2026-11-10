import { definePreset } from '@primeuix/themes';
import Aura from '@primeuix/themes/aura';

/**
 * Aura with the FieldOps teal (matches the login design: #0b7a73 buttons, #0b9187 → #08524f hero).
 * Softer, rounder fields and buttons.
 */
export const FieldOpsPreset = definePreset(Aura, {
  semantic: {
    primary: {
      50: '#ebf8f7',
      100: '#cdeeea',
      200: '#9fdcd5',
      300: '#66c4bb',
      400: '#2fa89d',
      500: '#0e9086',
      600: '#0b7a73',
      700: '#0a635e',
      800: '#0b4f4b',
      900: '#0b413e',
      950: '#042725',
    },
    formField: {
      borderRadius: '10px',
    },
    colorScheme: {
      light: {
        formField: {
          borderColor: '#d9e3e6',
          hoverBorderColor: '#9fdcd5',
        },
      },
    },
  },
});
