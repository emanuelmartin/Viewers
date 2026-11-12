import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import { Header, useModal } from '@ohif/ui-next';
import { useSystem } from '@ohif/core';
import { Toolbar } from '../Toolbar/Toolbar';
import HeaderViewStudyButton from './HeaderViewStudyButton';
import HeaderDownloadButton from './HeaderDownloadButton';
import HeaderModeSwitch from './HeaderModeSwitch';
import { preserveQueryParameters } from '@ohif/app';
import { Types } from '@ohif/core';

/** The header toolbar in labelled groups; anything not listed (pixOS AI, report capture…) goes to «Más». */
const TOOL_GROUPS = [
  {
    label: 'Navegar',
    ids: ['Zoom', 'Pan', 'TrackballRotate', 'StackScroll', 'Crosshairs', 'ReferenceLines', 'ImageSliceSync'],
  },
  { label: 'Imagen', ids: ['WindowLevel', 'pixosProcess'] },
  { label: 'Medir', ids: ['MeasurementTools'] },
  // pixOS: the tools of the modality on screen (TC, RM, PET, US…); its name comes from the active view
  { label: 'Modalidad', ids: [], prefix: 'px.mod.' },
  { label: 'Vista', ids: ['Layout', 'px.3d'] },
  { label: 'Informe', ids: ['pixosAddToReport'] },
  { label: 'Más', ids: ['Capture', 'MoreTools'] },
];

const MODALITY_NAME: Record<string, string> = {
  CT: 'TC',
  MR: 'RM',
  PT: 'PET',
  NM: 'Nuclear',
  US: 'US',
  MG: 'Mastografía',
  CR: 'Rayos X',
  DX: 'Rayos X',
  XA: 'Angio',
  RF: 'Fluoro',
};

/** Name of the modality in the active view, for the toolbar's modality group. */
function useActiveModalityName(servicesManager): string {
  const { viewportGridService, displaySetService } = servicesManager.services;
  const read = () => {
    const uids: string[] =
      viewportGridService.getState().viewports.get(viewportGridService.getActiveViewportId())
        ?.displaySetInstanceUIDs || [];
    const ds: any = uids
      .map(uid => displaySetService.getDisplaySetByUID(uid))
      .find((d: any) => d && !['SEG', 'SR', 'RTSTRUCT'].includes(d.Modality));
    return ds ? MODALITY_NAME[ds.Modality] || ds.Modality : '';
  };
  const [name, setName] = React.useState(read);
  React.useEffect(() => {
    const update = () => setName(prev => read() || prev);
    const subs = [
      viewportGridService.subscribe(viewportGridService.EVENTS.ACTIVE_VIEWPORT_ID_CHANGED, update),
      viewportGridService.subscribe(viewportGridService.EVENTS.GRID_STATE_CHANGED, update),
      displaySetService.subscribe(displaySetService.EVENTS.DISPLAY_SETS_ADDED, update),
    ];
    return () => subs.forEach(sub => sub.unsubscribe());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return name;
}

function ViewerHeader({ appConfig }: withAppTypes<{ appConfig: AppTypes.Config }>) {
  const { servicesManager, extensionManager } = useSystem();
  const { customizationService } = servicesManager.services;
  const modalityName = useActiveModalityName(servicesManager);
  const groups = React.useMemo(
    () => TOOL_GROUPS.map(g => (g.prefix === 'px.mod.' ? { ...g, label: modalityName || 'Modalidad' } : g)),
    [modalityName]
  );

  const navigate = useNavigate();
  const location = useLocation();

  const onClickReturnButton = () => {
    const { pathname } = location;
    const dataSourceIdx = pathname.indexOf('/', 1);

    const dataSourceName = pathname.substring(dataSourceIdx + 1);
    const existingDataSource = extensionManager.getDataSources(dataSourceName);

    const searchQuery = new URLSearchParams();
    if (dataSourceIdx !== -1 && existingDataSource) {
      searchQuery.append('datasources', pathname.substring(dataSourceIdx + 1));
    }
    preserveQueryParameters(searchQuery, customizationService);

    navigate({
      pathname: '/',
      search: decodeURIComponent(searchQuery.toString()),
    });
  };

  const { t } = useTranslation();
  const { show } = useModal();

  const AboutModal = customizationService.getCustomization(
    'ohif.aboutModal'
  ) as Types.MenuComponentCustomization;

  const AppearanceModal = customizationService.getCustomization(
    'ohif.appearanceModal'
  ) as Types.MenuComponentCustomization;

  const UserPreferencesModal = customizationService.getCustomization(
    'ohif.userPreferencesModal'
  ) as Types.MenuComponentCustomization;

  // Whatever fills the right side of the menu bar, in order: undo/redo then
  // patient info by default. Each item is rendered as a component, so it can
  // bring its own hooks, and reordering the list reorders the header.
  const rightSideItems = customizationService.getCustomization('ohif.headerRightSide')?.items ?? [];

  const menuOptions = [
    {
      title: AboutModal?.menuTitle ?? t('Header:About'),
      icon: 'info',
      onClick: () =>
        show({
          content: AboutModal,
          title: AboutModal?.title ?? t('AboutModal:About OHIF Viewer'),
          containerClassName: AboutModal?.containerClassName ?? 'max-w-md',
        }),
    },
    {
      title: UserPreferencesModal.menuTitle ?? t('Header:Preferences'),
      icon: 'settings',
      onClick: () =>
        show({
          content: UserPreferencesModal,
          title: UserPreferencesModal.title ?? t('UserPreferencesModal:User preferences'),
          containerClassName:
            UserPreferencesModal?.containerClassName ?? 'flex max-w-4xl p-6 flex-col',
        }),
    },
  ];

  if (AppearanceModal) {
    menuOptions.splice(1, 0, {
      title: AppearanceModal.menuTitle ?? t('Header:Appearance'),
      icon: 'ColorChange',
      onClick: () =>
        show({
          content: AppearanceModal,
          title: AppearanceModal.title ?? t('AppearanceModal:Appearance'),
          containerClassName: AppearanceModal.containerClassName ?? 'max-w-md',
        }),
    });
  }

  if (appConfig.oidc) {
    menuOptions.push({
      title: t('Header:Logout'),
      icon: 'power-off',
      onClick: async () => {
        navigate(`/logout?redirect_uri=${encodeURIComponent(window.location.href)}`);
      },
    });
  }

  return (
    <Header
      menuOptions={menuOptions}
      isReturnEnabled={!!appConfig.showStudyList}
      onClickReturnButton={onClickReturnButton}
      WhiteLabeling={appConfig.whiteLabeling}
      Secondary={
        <div className="flex items-center gap-1">
          <Toolbar buttonSection="secondary" />
          <HeaderModeSwitch />
          <HeaderViewStudyButton />
          <HeaderDownloadButton />
        </div>
      }
      RightSide={rightSideItems.map((Item, index) => (
        // The list is static per configuration, so the index is a stable key.
        <Item key={index} />
      ))}
    >
      {/* En pantallas angostas (o el visor embebido en «Informar») la barra va abajo: aquí no se repite */}
      <div className="relative flex items-stretch justify-center max-sm:hidden">
        <Toolbar
          buttonSection="primary"
          groups={groups}
        />
      </div>
    </Header>
  );
}

export default ViewerHeader;
