import React from 'react';
import classnames from 'classnames';

export type MobileTab = 'studies' | 'images' | 'interpretations';

interface MobileNavTabsProps {
  activeTab: MobileTab;
  onTabChange: (tab: MobileTab) => void;
}

const TABS: { id: MobileTab; label: string }[] = [
  { id: 'studies', label: 'Estudios' },
  { id: 'images', label: 'Imagenes' },
  { id: 'interpretations', label: 'Interpretacion' },
];

const MobileNavTabs: React.FC<MobileNavTabsProps> = ({ activeTab, onTabChange }) => {
  return (
    <div className="border-secondary-dark bg-secondary-dark flex h-[36px] flex-shrink-0 border-b">
      {TABS.map(tab => (
        <button
          key={tab.id}
          onClick={() => onTabChange(tab.id)}
          className={classnames(
            'flex flex-1 items-center justify-center text-xs font-medium transition-colors',
            activeTab === tab.id
              ? 'bg-customblue-40 text-white'
              : 'text-primary hover:bg-primary-dark'
          )}
          data-cy={`mobile-nav-tab-${tab.id}`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
};

export default MobileNavTabs;
