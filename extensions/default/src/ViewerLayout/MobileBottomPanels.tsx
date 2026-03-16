import React, { useState, useCallback } from 'react';
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

  const [isExpanded, setIsExpanded] = useState(true);
  const [activeTabIndex, setActiveTabIndex] = useState(0);

  const toggleExpand = useCallback(() => {
    setIsExpanded(prev => !prev);
  }, []);

  const handleTabClick = useCallback(
    (index: number) => {
      if (allTabs[index]?.disabled) {
        return;
      }
      if (activeTabIndex === index && isExpanded) {
        setIsExpanded(false);
      } else {
        setActiveTabIndex(index);
        setIsExpanded(true);
      }
    },
    [activeTabIndex, isExpanded, allTabs]
  );

  if (allTabs.length === 0) {
    return null;
  }

  const activeTab = allTabs[activeTabIndex];

  return (
    <div
      className="bg-black flex flex-col"
      style={{
        height: isExpanded ? '45vh' : '44px',
        minHeight: '44px',
        maxHeight: isExpanded ? '55vh' : '44px',
        transition: 'height 0.25s ease-in-out, max-height 0.25s ease-in-out',
      }}
    >
      {/* Tab bar + expand toggle */}
      <div className="bg-secondary-dark flex h-[44px] flex-shrink-0 items-center border-t border-black">
        {/* Expand/Collapse arrow button */}
        <button
          className="text-primary flex h-full w-[36px] items-center justify-center"
          onClick={toggleExpand}
          aria-label={isExpanded ? 'Collapse panel' : 'Expand panel'}
        >
          <Icons.ChevronDown
            className={classnames(
              'text-primary h-5 w-5 transition-transform duration-200',
              isExpanded ? '' : 'rotate-180'
            )}
          />
        </button>

        {/* Tab buttons */}
        <div className="flex flex-1 items-center gap-1 overflow-x-auto px-1">
          {allTabs.map((tab, index) => {
            const isActive = index === activeTabIndex && isExpanded;
            return (
              <button
                key={`${tab.source}-${tab.name}-${index}`}
                onClick={() => handleTabClick(index)}
                className={classnames(
                  'flex h-[32px] items-center gap-1.5 rounded px-2.5 text-xs whitespace-nowrap transition-colors',
                  {
                    'bg-customblue-40 text-white': isActive,
                    'text-primary hover:bg-primary-dark': !isActive && !tab.disabled,
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
        <div className="flex-1 overflow-auto bg-black">
          <activeTab.content />
        </div>
      )}
    </div>
  );
};

export default MobileBottomPanels;
