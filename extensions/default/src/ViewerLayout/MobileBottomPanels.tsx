import React, { useEffect, useState } from 'react';
import classnames from 'classnames';
import { Icons } from '@ohif/ui-next';

type MobileBottomPanelsProps = {
  leftPanelTabs: any[];
  rightPanelTabs: any[];
  servicesManager: any;
};

/**
 * Mobile bottom panel component that renders all side panel tabs
 * at the bottom of the screen with expand/collapse functionality.
 *
 * - Studies panel is open by default
 * - Tabs for left panels (studies) and right panels (segmentations, measurements)
 *   are shown side by side in a bottom tab bar
 * - Expand arrow points UP when collapsed, DOWN when expanded
 * - Panel content has overflow-y-auto for scrolling
 */
const MobileBottomPanels: React.FC<MobileBottomPanelsProps> = ({
  leftPanelTabs,
  rightPanelTabs,
}) => {
  const allTabs = [
    ...leftPanelTabs.map(t => ({ ...t, source: 'left' })),
    ...rightPanelTabs.map(t => ({ ...t, source: 'right' })),
  ];

  // Landscape phones are short: start collapsed there so the viewport keeps
  // most of the height; the tab bar still opens the panel on demand.
  const [isExpanded, setIsExpanded] = useState(() => window.innerHeight >= window.innerWidth);
  const [activeTabIndex, setActiveTabIndex] = useState(0);

  // Follow device rotation: open the panel when turning to portrait, fold it
  // when turning to landscape. Plain resizes that keep the orientation leave
  // whatever the user chose alone.
  useEffect(() => {
    let wasPortrait = window.innerHeight >= window.innerWidth;
    const onResize = () => {
      const isPortrait = window.innerHeight >= window.innerWidth;
      if (isPortrait !== wasPortrait) {
        wasPortrait = isPortrait;
        setIsExpanded(isPortrait);
      }
    };
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
    };
  }, []);

  const toggleExpand = () => {
    setIsExpanded(prev => !prev);
  };

  const handleTabClick = (index: number) => {
    if (allTabs[index]?.disabled) {
      return;
    }
    if (activeTabIndex === index && isExpanded) {
      setIsExpanded(false);
    } else {
      setActiveTabIndex(index);
      setIsExpanded(true);
    }
  };

  if (allTabs.length === 0) {
    return null;
  }

  const activeTab = allTabs[activeTabIndex];

  return (
    <div
      className="bg-black flex flex-col"
      style={{
        // Size to the panel content (one row of thumbnails is far shorter than
        // the cap), so the viewport above keeps the rest of the screen.
        minHeight: 'calc(44px + env(safe-area-inset-bottom, 0px))',
        maxHeight: isExpanded
          ? 'calc(45vh + env(safe-area-inset-bottom, 0px))'
          : 'calc(44px + env(safe-area-inset-bottom, 0px))',
        transition: 'max-height 0.25s ease-in-out',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}
    >
      {/* Tab bar + expand toggle */}
      <div className="bg-card border-border flex h-[40px] flex-shrink-0 items-center border-t">
        {/* Expand/Collapse arrow button */}
        <button
          className="text-primary flex h-full w-[32px] items-center justify-center flex-shrink-0"
          onClick={toggleExpand}
          aria-label={isExpanded ? 'Collapse panel' : 'Expand panel'}
        >
          <Icons.ChevronDown
            className={classnames(
              'text-primary h-4 w-4 transition-transform duration-200',
              isExpanded ? '' : 'rotate-180'
            )}
          />
        </button>

        {/* Tab buttons */}
        <div className="flex flex-1 items-center gap-0.5 overflow-x-auto px-0.5">
          {allTabs.map((tab, index) => {
            const isActive = index === activeTabIndex && isExpanded;
            return (
              <button
                key={`${tab.source}-${tab.name}-${index}`}
                onClick={() => handleTabClick(index)}
                className={classnames(
                  'flex h-[28px] items-center gap-1 rounded px-2 text-xs whitespace-nowrap transition-colors',
                  {
                    // Pixos RIS: active tab raised (#1e3a5f) with a blue underline
                    'bg-secondary text-foreground shadow-[inset_0_-2px_0_hsl(var(--brand-accent))]': isActive,
                    'text-primary hover:bg-brand/50': !isActive && !tab.disabled,
                    'text-muted-foreground cursor-not-allowed opacity-50': tab.disabled,
                  }
                )}
                data-cy={`mobile-tab-${tab.name}`}
                disabled={tab.disabled}
              >
                {tab.iconName &&
                  React.createElement(Icons[tab.iconName] || Icons.MissingIcon, {
                    className: 'h-4 w-4',
                  })}
                <span className="max-w-[80px] truncate">{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Panel content area */}
      {isExpanded && activeTab && (
        <div className="flex-1 overflow-y-auto overflow-x-hidden bg-black">
          <activeTab.content />
        </div>
      )}
    </div>
  );
};

export default MobileBottomPanels;
