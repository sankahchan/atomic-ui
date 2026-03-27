'use client';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';

export const DYNAMIC_ROUTING_ALERT_RULE_DEFINITIONS = [
  {
    key: 'NO_MATCH',
    label: 'No matching backend',
    description: 'Send an alert when routing cannot find any eligible backend or server.',
  },
  {
    key: 'HEALTH_ALERT',
    label: 'Health degradation',
    description: 'Send an alert when the current backend is unhealthy, slow, or otherwise degraded.',
  },
  {
    key: 'QUOTA_ALERT',
    label: 'Quota pressure',
    description: 'Send an alert when the active backend is nearing or hitting its usage limit.',
  },
  {
    key: 'FLAPPING_ALERT',
    label: 'Backend flapping',
    description: 'Send an alert when the dynamic key keeps switching between backends too often.',
  },
] as const;

type DynamicRoutingAlertRuleKey = (typeof DYNAMIC_ROUTING_ALERT_RULE_DEFINITIONS)[number]['key'];

export type DynamicRoutingAlertRuleFormState = {
  defaultCooldownMinutes: number;
  rules: Record<
    DynamicRoutingAlertRuleKey,
    {
      enabled: boolean;
      cooldownMinutes: number;
      channels: string;
    }
  >;
};

const DEFAULT_ALERT_RULE_FORM_STATE: DynamicRoutingAlertRuleFormState = {
  defaultCooldownMinutes: 30,
  rules: {
    NO_MATCH: { enabled: true, cooldownMinutes: 30, channels: '' },
    HEALTH_ALERT: { enabled: true, cooldownMinutes: 30, channels: '' },
    QUOTA_ALERT: { enabled: true, cooldownMinutes: 30, channels: '' },
    FLAPPING_ALERT: { enabled: true, cooldownMinutes: 30, channels: '' },
  },
};

function parseChannels(channels: unknown) {
  if (!Array.isArray(channels)) {
    return '';
  }

  return channels
    .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
    .filter(Boolean)
    .join(', ');
}

export function parseDynamicRoutingAlertRules(
  rawValue: string | null | undefined,
): DynamicRoutingAlertRuleFormState {
  const next: DynamicRoutingAlertRuleFormState = {
    defaultCooldownMinutes: DEFAULT_ALERT_RULE_FORM_STATE.defaultCooldownMinutes,
    rules: {
      NO_MATCH: { ...DEFAULT_ALERT_RULE_FORM_STATE.rules.NO_MATCH },
      HEALTH_ALERT: { ...DEFAULT_ALERT_RULE_FORM_STATE.rules.HEALTH_ALERT },
      QUOTA_ALERT: { ...DEFAULT_ALERT_RULE_FORM_STATE.rules.QUOTA_ALERT },
      FLAPPING_ALERT: { ...DEFAULT_ALERT_RULE_FORM_STATE.rules.FLAPPING_ALERT },
    },
  };

  if (!rawValue) {
    return next;
  }

  try {
    const parsed = JSON.parse(rawValue) as Record<string, unknown>;
    if (typeof parsed.cooldownMinutes === 'number' && Number.isFinite(parsed.cooldownMinutes)) {
      next.defaultCooldownMinutes = Math.max(0, Math.round(parsed.cooldownMinutes));
    }

    for (const definition of DYNAMIC_ROUTING_ALERT_RULE_DEFINITIONS) {
      const entry = parsed[definition.key];
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
        continue;
      }

      const record = entry as Record<string, unknown>;
      next.rules[definition.key] = {
        enabled: typeof record.enabled === 'boolean' ? record.enabled : next.rules[definition.key].enabled,
        cooldownMinutes:
          typeof record.cooldownMinutes === 'number' && Number.isFinite(record.cooldownMinutes)
            ? Math.max(0, Math.round(record.cooldownMinutes))
            : next.rules[definition.key].cooldownMinutes,
        channels: parseChannels(record.channels),
      };
    }
  } catch {
    return next;
  }

  return next;
}

export function serializeDynamicRoutingAlertRules(value: DynamicRoutingAlertRuleFormState) {
  const next: Record<string, unknown> = {
    cooldownMinutes: Math.max(0, Math.round(value.defaultCooldownMinutes || 0)),
  };

  for (const definition of DYNAMIC_ROUTING_ALERT_RULE_DEFINITIONS) {
    const rule = value.rules[definition.key];
    next[definition.key] = {
      enabled: rule.enabled,
      cooldownMinutes: Math.max(0, Math.round(rule.cooldownMinutes || 0)),
      ...(rule.channels.trim()
        ? {
            channels: rule.channels
              .split(',')
              .map((entry) => entry.trim())
              .filter(Boolean),
          }
        : {}),
    };
  }

  return JSON.stringify(next);
}

export function DynamicRoutingAlertRulesEditor({
  value,
  onChange,
  compact = false,
}: {
  value: string | null | undefined;
  onChange: (nextValue: string) => void;
  compact?: boolean;
}) {
  const rules = parseDynamicRoutingAlertRules(value);

  const updateRules = (
    updater: (current: DynamicRoutingAlertRuleFormState) => DynamicRoutingAlertRuleFormState,
  ) => {
    onChange(serializeDynamicRoutingAlertRules(updater(rules)));
  };

  return (
    <div className="space-y-4 rounded-xl border border-border/60 bg-background/55 p-4 dark:bg-white/[0.03]">
      <div className="space-y-1">
        <h4 className="text-sm font-semibold">Alert delivery rules</h4>
        <p className="text-xs text-muted-foreground">
          Tune alert cooldowns and optionally route specific alert types to selected channels. Leave channels blank to use every eligible channel.
        </p>
      </div>

      <div className="space-y-2">
        <Label>Default cooldown (minutes)</Label>
        <Input
          type="number"
          min={0}
          value={rules.defaultCooldownMinutes}
          onChange={(event) =>
            updateRules((current) => ({
              ...current,
              defaultCooldownMinutes: Number(event.target.value) || 0,
            }))
          }
        />
      </div>

      <div className="space-y-3">
        {DYNAMIC_ROUTING_ALERT_RULE_DEFINITIONS.map((definition) => {
          const rule = rules.rules[definition.key];

          return (
            <div
              key={definition.key}
              className="rounded-[1rem] border border-border/60 bg-background/65 p-4 dark:bg-white/[0.02]"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <p className="text-sm font-medium">{definition.label}</p>
                  <p className="text-xs leading-5 text-muted-foreground">{definition.description}</p>
                </div>
                <Switch
                  checked={rule.enabled}
                  onCheckedChange={(checked) =>
                    updateRules((current) => ({
                      ...current,
                      rules: {
                        ...current.rules,
                        [definition.key]: {
                          ...current.rules[definition.key],
                          enabled: checked,
                        },
                      },
                    }))
                  }
                />
              </div>

              <div className={`mt-4 grid gap-3 ${compact ? '' : 'md:grid-cols-2'}`}>
                <div className="space-y-2">
                  <Label>Cooldown (minutes)</Label>
                  <Input
                    type="number"
                    min={0}
                    value={rule.cooldownMinutes}
                    onChange={(event) =>
                      updateRules((current) => ({
                        ...current,
                        rules: {
                          ...current.rules,
                          [definition.key]: {
                            ...current.rules[definition.key],
                            cooldownMinutes: Number(event.target.value) || 0,
                          },
                        },
                      }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>Channels</Label>
                  <Input
                    value={rule.channels}
                    onChange={(event) =>
                      updateRules((current) => ({
                        ...current,
                        rules: {
                          ...current.rules,
                          [definition.key]: {
                            ...current.rules[definition.key],
                            channels: event.target.value,
                          },
                        },
                      }))
                    }
                    placeholder="telegram, email, webhook"
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
