import { Button } from '@/components/ui';
import { useSettings } from '@/features/settings/settings-context';
import { isPronunciationSupported, speak } from '@/services/pronunciation';

/**
 * Speech synthesis is an audio convenience only. When the browser cannot do it,
 * the control is disabled with an explanation rather than silently failing.
 */
export function PronounceButton({
  text,
  size = 'sm',
  label = '發音',
}: {
  text: string;
  size?: 'sm' | 'md';
  label?: string;
}) {
  const { settings } = useSettings();
  // A stable browser capability, safe to read during render.
  const supported = isPronunciationSupported();

  const disabled = !supported || !settings.pronunciationEnabled;
  const title = !supported
    ? '這個瀏覽器不支援語音合成'
    : !settings.pronunciationEnabled
      ? '已在設定中停用發音'
      : `播放 ${text} 的發音`;

  return (
    <Button
      size={size}
      variant="secondary"
      disabled={disabled}
      title={title}
      aria-label={`${label}：${text}`}
      onClick={() => speak(text)}
    >
      <span aria-hidden="true">🔊</span>
      <span>{label}</span>
    </Button>
  );
}
