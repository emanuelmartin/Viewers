import React, { ReactNode } from 'react';
import classNames from 'classnames';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  Icons,
  Button,
  ToolButton,
} from '../';
import { IconPresentationProvider } from '@ohif/ui-next';

import NavBar from '../NavBar';

// Todo: we should move this component to composition and remove props base

interface HeaderProps {
  children?: ReactNode;
  menuOptions: Array<{
    title: string;
    icon?: string;
    onClick: () => void;
  }>;
  isReturnEnabled?: boolean;
  onClickReturnButton?: () => void;
  isSticky?: boolean;
  WhiteLabeling?: {
    createLogoComponentFn?: (React: any, props: any) => ReactNode;
  };
  Secondary?: ReactNode;
  /**
   * Ordered slots filling the right of the menu bar, ahead of the settings
   * menu — patient info, undo/redo, whatever a site puts there. Each is
   * followed by a separator, and a slot whose content renders nothing takes
   * its separator with it.
   */
  RightSide?: ReactNode[];
}

function Header({
  children,
  menuOptions,
  isReturnEnabled = true,
  onClickReturnButton,
  isSticky = false,
  WhiteLabeling,
  RightSide = [],
  Secondary,
  ...props
}: HeaderProps): ReactNode {
  const onClickReturn = () => {
    if (isReturnEnabled && onClickReturnButton) {
      onClickReturnButton();
    }
  };

  const logo = WhiteLabeling?.createLogoComponentFn?.(React, props) || <Icons.OHIFLogo />;

  // Each slot is followed by a separator; `empty:hidden` drops the slot and its
  // separator when the item renders nothing (e.g. `showPatientInfo: 'disabled'`).
  const renderRightSideItems = (slotClassName: string) =>
    RightSide.map((item, index) => (
      <div
        key={index}
        className={classNames(
          "after:border-primary-dark flex items-center empty:hidden after:mx-1.5 after:h-[25px] after:border-r after:content-['']",
          slotClassName
        )}
      >
        {item}
      </div>
    ));

  const settingsMenu = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="text-primary hover:bg-primary-dark h-full w-full"
        >
          <Icons.GearSettings />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {menuOptions.map((option, index) => {
          const IconComponent = option.icon ? Icons[option.icon as keyof typeof Icons] : null;
          return (
            <DropdownMenuItem
              key={index}
              onSelect={option.onClick}
              className="flex items-center gap-2 py-2"
            >
              {IconComponent && (
                <span className="flex h-4 w-4 items-center justify-center">
                  <Icons.ByName name={option.icon} />
                </span>
              )}
              <span className="flex-1">{option.title}</span>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    <IconPresentationProvider
      size="large"
      IconContainer={ToolButton}
    >
      <NavBar
        isSticky={isSticky}
        {...props}
      >
        {/* Desktop (>= 1024px): logo | toolbar | right-side slots + settings */}
        <div className="hidden h-[48px] items-center justify-between gap-2 px-2 lg:flex">
          <div className="flex flex-shrink-0 items-center">
            <div className={classNames('mr-3 inline-flex items-center', isSticky && 'py-6')}>
              {isSticky && <Button onClick={onClickReturn}>{<Icons.ArrowLeftBold />}</Button>}
              <div className="ml-2">{logo}</div>
            </div>
            {Secondary && <div className="ml-2">{Secondary}</div>}
          </div>
          <div className="flex min-w-0 flex-1 justify-center px-2">
            <div className="ohif-scrollbar-toolbar flex w-full items-center justify-center space-x-2 overflow-x-auto overflow-y-hidden">
              {children}
            </div>
          </div>
          <div className="flex flex-shrink-0 select-none items-center">
            {renderRightSideItems('flex-shrink-0')}
            {/* HSRL: settings menu hidden, as in production */}
            <div className="hidden">{settingsMenu}</div>
          </div>
        </div>

        {/* Mobile/tablet (< 1024px): logo + right-side slots, then a scrollable toolbar row */}
        <div className="flex flex-col lg:hidden">
          <div className="flex h-[40px] items-center justify-between gap-1 px-1">
            <div className="flex-shrink-0">{logo}</div>
            <div className="flex min-w-0 flex-1 select-none items-center justify-end overflow-hidden">
              {renderRightSideItems('min-w-0')}
              {/* HSRL: settings menu hidden, as in production */}
            <div className="hidden">{settingsMenu}</div>
            </div>
          </div>
          <div className="border-primary-dark ohif-scrollbar-toolbar flex h-[40px] items-center overflow-x-auto overflow-y-hidden border-t px-1">
            <div className="mx-auto flex items-center gap-1">{children}</div>
          </div>
        </div>
      </NavBar>
    </IconPresentationProvider>
  );
}

export default Header;
