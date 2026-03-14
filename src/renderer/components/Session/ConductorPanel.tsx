import React from 'react';
import { User } from 'lucide-react';
import { useSettingsStore } from '../../store/settingsStore';

export interface ConductorPanelProps {
  expanded: boolean;
}

export default function ConductorPanel({ expanded }: ConductorPanelProps): React.JSX.Element {
  const conductorName = useSettingsStore((s) => s.userProfile.conductorName);
  const conductorColor = useSettingsStore((s) => s.userProfile.conductorColor);
  const conductorAvatar = useSettingsStore((s) => s.userProfile.conductorAvatar);

  const color = conductorColor || '#6b7280';
  const displayName = conductorName || 'Conductor';

  const avatarEl = (size: number) =>
    conductorAvatar ? (
      <img src={conductorAvatar} alt="" className="w-full h-full object-cover" />
    ) : (
      <User size={size} strokeWidth={1.75} style={{ color }} />
    );

  if (!expanded) {
    return (
      <div
        aria-label={`Conductor: ${displayName}`}
        className="w-12 flex flex-col items-center py-3"
        title={displayName}
      >
        <div
          className="w-8 h-8 rounded-full overflow-hidden flex items-center justify-center"
          style={{ backgroundColor: conductorAvatar ? undefined : `${color}25` }}
        >
          {avatarEl(18)}
        </div>
      </div>
    );
  }

  return (
    <div
      aria-label={`Conductor: ${displayName}`}
      className="w-48 bg-white dark:bg-gray-900 flex flex-col"
      style={{ borderLeft: `3px solid ${color}` }}
    >
      <div className="flex items-center gap-2 px-3 py-3">
        <div
          className="w-7 h-7 rounded-full overflow-hidden flex items-center justify-center shrink-0"
          style={{ backgroundColor: conductorAvatar ? undefined : `${color}25` }}
        >
          {avatarEl(16)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
            {displayName}
          </div>
          <div className="text-xs text-gray-400 dark:text-gray-500">conductor</div>
        </div>
      </div>
    </div>
  );
}
