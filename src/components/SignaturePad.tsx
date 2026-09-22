import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { Platform, View } from 'react-native';

// 手寫簽名畫布。App 主要以網頁使用（iPad 上用瀏覽器開），這裡直接用原生 HTML canvas
// 監聽 pointer 事件（滑鼠與手指共用同一套事件），不用另外裝簽名套件。
// React Native Web 會把 View 的 ref 轉發成底層真正的 DOM 節點，型別上抓不到、
// 所以這裡的 containerRef 故意用 any，是刻意的，不是漏標型別。
// 原生 App（非網頁）版本目前不支援手寫簽名，顯示空白提示區塊即可，這個 App 本來就以網頁為主。

export interface SignaturePadHandle {
  clear: () => void;
  isEmpty: () => boolean;
  /** 有簽名才回傳 data:image/png;base64,... 網址，沒簽會回傳 null */
  toDataURL: () => string | null;
}

interface SignaturePadProps {
  height?: number;
}

export const SignaturePad = forwardRef<SignaturePadHandle, SignaturePadProps>(
  function SignaturePad({ height = 180 }, ref) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const containerRef = useRef<any>(null);
    const apiRef = useRef<SignaturePadHandle>({
      clear: () => {},
      isEmpty: () => true,
      toDataURL: () => null,
    });

    useImperativeHandle(ref, () => ({
      clear: () => apiRef.current.clear(),
      isEmpty: () => apiRef.current.isEmpty(),
      toDataURL: () => apiRef.current.toDataURL(),
    }));

    useEffect(() => {
      if (Platform.OS !== 'web' || !containerRef.current) return;
      const container: HTMLDivElement = containerRef.current;
      const canvas = document.createElement('canvas');
      const rect = container.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.max(1, Math.floor(rect.width * dpr));
      canvas.height = Math.max(1, Math.floor(height * dpr));
      canvas.style.width = '100%';
      canvas.style.height = `${height}px`;
      canvas.style.display = 'block';
      canvas.style.touchAction = 'none'; // 手指畫的時候不要連動整頁捲動
      canvas.style.cursor = 'crosshair';
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.scale(dpr, dpr);
      ctx.lineWidth = 2.4;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = '#2b1e21';

      let drawing = false;
      let hasDrawn = false;

      const getPos = (e: PointerEvent) => {
        const r = canvas.getBoundingClientRect();
        return { x: e.clientX - r.left, y: e.clientY - r.top };
      };
      const down = (e: PointerEvent) => {
        drawing = true;
        hasDrawn = true;
        const p = getPos(e);
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        canvas.setPointerCapture(e.pointerId);
        e.preventDefault();
      };
      const move = (e: PointerEvent) => {
        if (!drawing) return;
        const p = getPos(e);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
        e.preventDefault();
      };
      const up = () => { drawing = false; };

      canvas.addEventListener('pointerdown', down);
      canvas.addEventListener('pointermove', move);
      canvas.addEventListener('pointerup', up);
      canvas.addEventListener('pointerleave', up);
      canvas.addEventListener('pointercancel', up);

      container.innerHTML = '';
      container.appendChild(canvas);

      apiRef.current = {
        clear: () => { ctx.clearRect(0, 0, canvas.width, canvas.height); hasDrawn = false; },
        isEmpty: () => !hasDrawn,
        toDataURL: () => (hasDrawn ? canvas.toDataURL('image/png') : null),
      };

      return () => {
        canvas.removeEventListener('pointerdown', down);
        canvas.removeEventListener('pointermove', move);
        canvas.removeEventListener('pointerup', up);
        canvas.removeEventListener('pointerleave', up);
        canvas.removeEventListener('pointercancel', up);
      };
    }, [height]);

    if (Platform.OS !== 'web') {
      return (
        <View style={{ height, borderRadius: 16, backgroundColor: '#f5e6ec' }} />
      );
    }

    return (
      <View
        ref={containerRef}
        style={{ height, borderRadius: 16, overflow: 'hidden', backgroundColor: '#fff', borderWidth: 1, borderColor: '#e8dce8' }}
      />
    );
  },
);
