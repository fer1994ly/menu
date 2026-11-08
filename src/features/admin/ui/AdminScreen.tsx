import { useState } from 'react';
import { useServices } from '@/app/AppServicesProvider';
import { Button } from '@/shared/ui/Button';
import { Card } from '@/shared/ui/Card';
import { Field, INPUT_CLASS } from '@/shared/ui/Field';
import { Notice } from '@/shared/ui/Notice';
import { useLiveData } from '@/shared/ui/liveData';
import { checkAdminKey } from '../domain/adminKey';
import type { Settings } from '../domain/settings';
import { buildSettings, initialTexts, SETTINGS_FIELDS } from './settingsFields';

function KeyForm({ onUnlock }: { onUnlock(): void }) {
  const [key, setKey] = useState('');
  const [error, setError] = useState<string | null>(null);
  return (
    <Card title="Clave de administración">
      <Notice className="mb-3">
        Es una clave simple y local: no es autenticación real. Está escrita dentro del código de la app, así que solo evita cambios por error en la cocina.
      </Notice>
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (checkAdminKey(key)) onUnlock();
          else setError('Clave incorrecta');
        }}
      >
        <Field label="Clave de administración" error={error ?? undefined} className="min-w-56 flex-1">
          {(c) => <input {...c} type="password" autoComplete="off" className={INPUT_CLASS} value={key} onChange={(e) => setKey(e.target.value)} />}
        </Field>
        <Button type="submit" variant="primary">
          Entrar
        </Button>
      </form>
    </Card>
  );
}

function SettingsForm({ settings, onSaved }: { settings: Settings; onSaved(): void }) {
  const { changes } = useServices();
  const [texts, setTexts] = useState<Record<string, string>>(() => initialTexts(settings));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const groups = [...new Set(SETTINGS_FIELDS.map((f) => f.group))];

  const submit = async () => {
    setBusy(true);
    try {
      const result = await changes.saveSettings(buildSettings(settings, texts));
      setErrors(result.ok ? {} : result.errors);
      if (result.ok) onSaved();
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      data-testid="admin-form"
      className="flex flex-col gap-4"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      {groups.map((group) => (
        <Card key={group} title={group}>
          <div className="grid gap-3 sm:grid-cols-2">
            {SETTINGS_FIELDS.filter((f) => f.group === group).map((field) => (
              <Field key={field.path} label={field.label} error={errors[field.path]}>
                {(c) => (
                  <input
                    {...c}
                    type="number"
                    step={field.step}
                    className={INPUT_CLASS}
                    value={texts[field.path] ?? ''}
                    onChange={(e) => setTexts((t) => ({ ...t, [field.path]: e.target.value }))}
                  />
                )}
              </Field>
            ))}
          </div>
        </Card>
      ))}
      <div>
        <Button type="submit" variant="primary" disabled={busy}>
          Guardar ajustes
        </Button>
      </div>
    </form>
  );
}

export function AdminScreen() {
  const { repos } = useServices();
  const [unlocked, setUnlocked] = useState(false);
  const [saved, setSaved] = useState(false);
  const { data: settings } = useLiveData(() => repos.settings.get(), []);

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-2xl font-bold">Administración</h2>
      {!unlocked && <KeyForm onUnlock={() => setUnlocked(true)} />}
      {unlocked && saved && (
        <Notice tone="ok">Ajustes guardados. Los planes afectados quedan desactualizados hasta que los recalcules. Podés deshacer el cambio con «Deshacer».</Notice>
      )}
      {unlocked && settings && <SettingsForm key={JSON.stringify(settings)} settings={settings} onSaved={() => setSaved(true)} />}
    </div>
  );
}
