import React, { useEffect, useState, useCallback } from 'react';
import PropTypes from 'prop-types';

import { InvestigationalUseDialog } from '@ohif/ui-next';
import { HangingProtocolService, CommandsManager } from '@ohif/core';
import { useAppConfig } from '@state';
import ViewerHeader from './ViewerHeader';
import SidePanelWithServices from '../Components/SidePanelWithServices';
import { Onboarding, ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@ohif/ui-next';
import useResizablePanels from './ResizablePanelsHook';
import MobileBottomPanels from './MobileBottomPanels';
import MobileNavTabs, { MobileTab } from './MobileNavTabs';
import PanelInterpretations from '../Panels/PanelInterpretations';

const resizableHandleClassName = 'mt-[1px] bg-background';

function ViewerLayout({
  // From Extension Module Params
  extensionManager,
  servicesManager,
  hotkeysManager,
  commandsManager,
  // From Modes
  viewports,
  ViewportGridComp,
  leftPanelClosed = false,
  rightPanelClosed = false,
  leftPanelResizable = false,
  rightPanelResizable = false,
  leftPanelInitialExpandedWidth,
  rightPanelInitialExpandedWidth,
  leftPanelMinimumExpandedWidth,
  rightPanelMinimumExpandedWidth,
}: withAppTypes): React.FunctionComponent {
  const [appConfig] = useAppConfig();

  const { panelService, hangingProtocolService, customizationService } = servicesManager.services;
  const [showLoadingIndicator, setShowLoadingIndicator] = useState(appConfig.showLoadingIndicator);

  // Reactive mobile detection
  const [isMobile, setIsMobile] = useState(
    typeof window !== 'undefined' && window.innerWidth < 1024
  );

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 1024);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const initialRightPanelClosed = isMobile ? true : rightPanelClosed;
  const initialLeftPanelClosed = isMobile ? true : leftPanelClosed;

  const hasPanels = useCallback(
    (side): boolean => !!panelService.getPanels(side).length,
    [panelService]
  );

  const [hasRightPanels, setHasRightPanels] = useState(hasPanels('right'));
  const [hasLeftPanels, setHasLeftPanels] = useState(hasPanels('left'));
  const [leftPanelClosedState, setLeftPanelClosed] = useState(initialLeftPanelClosed);
  const [rightPanelClosedState, setRightPanelClosed] = useState(initialRightPanelClosed);

  // Mobile: get panel tabs directly for bottom panel rendering
  const [leftPanelTabs, setLeftPanelTabs] = useState(() => panelService.getPanels('left'));
  const [rightPanelTabs, setRightPanelTabs] = useState(() => panelService.getPanels('right'));
  const [mobileTab, setMobileTab] = useState<MobileTab>('images');

  const [
    leftPanelProps,
    rightPanelProps,
    resizablePanelGroupProps,
    resizableLeftPanelProps,
    resizableViewportGridPanelProps,
    resizableRightPanelProps,
    onHandleDragging,
  ] = useResizablePanels(
    leftPanelClosed,
    setLeftPanelClosed,
    rightPanelClosed,
    setRightPanelClosed,
    hasLeftPanels,
    hasRightPanels,
    leftPanelInitialExpandedWidth,
    rightPanelInitialExpandedWidth,
    leftPanelMinimumExpandedWidth,
    rightPanelMinimumExpandedWidth
  );

  const handleMouseEnter = () => {
    (document.activeElement as HTMLElement)?.blur();
  };

  const LoadingIndicatorProgress = customizationService.getCustomization(
    'ui.loadingIndicatorProgress'
  );

  /**
   * Set body classes (tailwindcss) that don't allow vertical
   * or horizontal overflow (no scrolling). Also guarantee window
   * is sized to our viewport.
   */
  useEffect(() => {
    document.body.classList.add('bg-background');
    document.body.classList.add('overflow-hidden');

    return () => {
      document.body.classList.remove('bg-background');
      document.body.classList.remove('overflow-hidden');
    };
  }, []);

  const getComponent = id => {
    const entry = extensionManager.getModuleEntry(id);

    if (!entry || !entry.component) {
      throw new Error(
        `${id} is not valid for an extension module or no component found from extension ${id}. Please verify your configuration or ensure that the extension is properly registered. It's also possible that your mode is utilizing a module from an extension that hasn't been included in its dependencies (add the extension to the "extensionDependencies" array in your mode's index.js file). Check the reference string to the extension in your Mode configuration`
      );
    }

    return { entry };
  };

  useEffect(() => {
    const { unsubscribe } = hangingProtocolService.subscribe(
      HangingProtocolService.EVENTS.PROTOCOL_CHANGED,

      // Todo: right now to set the loading indicator to false, we need to wait for the
      // hangingProtocolService to finish applying the viewport matching to each viewport,
      // however, this might not be the only approach to set the loading indicator to false. we need to explore this further.
      () => {
        setShowLoadingIndicator(false);
      }
    );

    return () => {
      unsubscribe();
    };
  }, [hangingProtocolService]);

  const getViewportComponentData = viewportComponent => {
    const { entry } = getComponent(viewportComponent.namespace);

    return {
      component: entry.component,
      isReferenceViewable: entry.isReferenceViewable,
      displaySetsToDisplay: viewportComponent.displaySetsToDisplay,
    };
  };

  useEffect(() => {
    const { unsubscribe } = panelService.subscribe(
      panelService.EVENTS.PANELS_CHANGED,
      ({ options }) => {
        setHasLeftPanels(hasPanels('left'));
        setHasRightPanels(hasPanels('right'));
        setLeftPanelTabs(panelService.getPanels('left'));
        setRightPanelTabs(panelService.getPanels('right'));
        if (options?.leftPanelClosed !== undefined) {
          setLeftPanelClosed(options.leftPanelClosed);
        }
        if (options?.rightPanelClosed !== undefined) {
          setRightPanelClosed(options.rightPanelClosed);
        }
      }
    );

    return () => {
      unsubscribe();
    };
  }, [panelService, hasPanels]);

  const viewportComponents = viewports.map(getViewportComponentData);

  // Bottom-panel tabs: exclude interpretations (it has its own top tab on mobile)
  const bottomRightTabs = rightPanelTabs.filter(t => t.name !== 'panelInterpretations');
  // Study browser: first left panel tab
  const studiesPanelTab = leftPanelTabs[0];

  // Mobile layout: header + 3-tab nav (Estudios | Imágenes | Interpretación)
  if (isMobile) {
    return (
      <div className="flex h-screen flex-col overflow-hidden">
        <ViewerHeader
          hotkeysManager={hotkeysManager}
          extensionManager={extensionManager}
          servicesManager={servicesManager}
          appConfig={appConfig}
        />
        {showLoadingIndicator && (
          <LoadingIndicatorProgress
            className="h-full w-full bg-background"
            logo={appConfig?.ui?.whiteLabeling?.logo}
          />
        )}

        {/* Top navigation tabs */}
        <MobileNavTabs
          activeTab={mobileTab}
          onTabChange={setMobileTab}
        />

        {/* Estudios tab — study browser */}
        {mobileTab === 'studies' && (
          <div className="flex-1 overflow-y-auto overflow-x-hidden bg-black">
            {studiesPanelTab ? (
              <studiesPanelTab.content />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                Sin estudios disponibles
              </div>
            )}
          </div>
        )}

        {/* Imágenes tab — keep viewport always mounted to avoid reloading DICOM */}
        <div className={mobileTab === 'images' ? 'flex flex-1 flex-col overflow-hidden' : 'hidden'}>
          <div
            className="relative flex flex-1 items-center justify-center overflow-hidden bg-background"
            onMouseEnter={handleMouseEnter}
          >
            <ViewportGridComp
              servicesManager={servicesManager}
              viewportComponents={viewportComponents}
              commandsManager={commandsManager}
            />
          </div>
          <MobileBottomPanels
            leftPanelTabs={leftPanelTabs}
            rightPanelTabs={bottomRightTabs}
            servicesManager={servicesManager}
          />
        </div>

        {/* Interpretación tab */}
        {mobileTab === 'interpretations' && (
          <div className="flex-1 overflow-y-auto overflow-x-hidden bg-black">
            <PanelInterpretations />
          </div>
        )}

        <Onboarding tours={customizationService.getCustomization('ohif.tours')} />
        <InvestigationalUseDialog dialogConfiguration={appConfig?.investigationalUseDialog} />
      </div>
    );
  }

  // Desktop layout: left panels | viewport | right panels
  return (
    <div>
      <ViewerHeader
        hotkeysManager={hotkeysManager}
        extensionManager={extensionManager}
        servicesManager={servicesManager}
        appConfig={appConfig}
      />
      <div
        className="relative flex w-full flex-row flex-nowrap items-stretch overflow-hidden bg-background"
        style={{ height: 'calc(100vh - 52px)' }}
      >
        <React.Fragment>
          {showLoadingIndicator && <LoadingIndicatorProgress className="h-full w-full bg-background" logo={appConfig?.ui?.whiteLabeling?.logo} />}
          <ResizablePanelGroup {...resizablePanelGroupProps}>
            {/* LEFT SIDEPANELS */}
            {hasLeftPanels ? (
              <>
                <ResizablePanel {...resizableLeftPanelProps}>
                  <SidePanelWithServices
                    side="left"
                    isExpanded={!leftPanelClosedState}
                    servicesManager={servicesManager}
                    {...leftPanelProps}
                  />
                </ResizablePanel>
                <ResizableHandle
                  onDragging={onHandleDragging}
                  disabled={!leftPanelResizable}
                  className={resizableHandleClassName}
                />
              </>
            ) : null}
            {/* TOOLBAR + GRID */}
            <ResizablePanel {...resizableViewportGridPanelProps}>
              <div className="flex h-full flex-1 flex-col">
                <div
                  className="relative flex h-full flex-1 items-center justify-center overflow-hidden bg-background"
                  onMouseEnter={handleMouseEnter}
                >
                  <ViewportGridComp
                    servicesManager={servicesManager}
                    viewportComponents={viewportComponents}
                    commandsManager={commandsManager}
                  />
                </div>
              </div>
            </ResizablePanel>
            {hasRightPanels ? (
              <>
                <ResizableHandle
                  onDragging={onHandleDragging}
                  disabled={!rightPanelResizable}
                  className={resizableHandleClassName}
                />
                <ResizablePanel {...resizableRightPanelProps}>
                  <SidePanelWithServices
                    side="right"
                    isExpanded={!rightPanelClosedState}
                    servicesManager={servicesManager}
                    {...rightPanelProps}
                  />
                </ResizablePanel>
              </>
            ) : null}
          </ResizablePanelGroup>
        </React.Fragment>
      </div>
      <Onboarding tours={customizationService.getCustomization('ohif.tours')} />
      <InvestigationalUseDialog dialogConfiguration={appConfig?.investigationalUseDialog} />
    </div>
  );
}

ViewerLayout.propTypes = {
  // From extension module params
  extensionManager: PropTypes.shape({
    getModuleEntry: PropTypes.func.isRequired,
  }).isRequired,
  commandsManager: PropTypes.instanceOf(CommandsManager),
  servicesManager: PropTypes.object.isRequired,
  // From modes
  leftPanels: PropTypes.array,
  rightPanels: PropTypes.array,
  leftPanelClosed: PropTypes.bool.isRequired,
  rightPanelClosed: PropTypes.bool.isRequired,
  /** Responsible for rendering our grid of viewports; provided by consuming application */
  children: PropTypes.oneOfType([PropTypes.node, PropTypes.func]).isRequired,
  viewports: PropTypes.array,
};

export default ViewerLayout;
