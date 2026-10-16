import { WithSkiaWeb } from '@shopify/react-native-skia/lib/module/web';
import type { ComponentProps, ComponentType } from 'react';

import type { GameCanvas as Impl } from './GameCanvasImpl';

// On the web, Skia needs CanvasKit (public/canvaskit.wasm, see `npm run web:setup`) loaded
// before any Skia code runs, so the canvas module is imported only after that.
type Props = ComponentProps<typeof Impl>;

export function GameCanvas(props: Props) {
  return (
    <WithSkiaWeb<Props>
      opts={{ locateFile: (file: string) => `/${file}` }}
      getComponent={() => import('./GameCanvasImpl').then((m) => ({ default: m.GameCanvas as ComponentType<Props> }))}
      componentProps={props}
    />
  );
}
