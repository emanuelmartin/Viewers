/**
 * PixOS commands.
 *
 * toggleCinePlayback (space): plays or pauses the active viewport's series
 * when it has more than one frame, opening the cine player (which shows the
 * FPS) the first time.
 */
function getCommandsModule({ servicesManager }: withAppTypes) {
  const { cineService, viewportGridService, displaySetService } = servicesManager.services;

  const canPlay = (viewportId: string): boolean => {
    const viewport = viewportGridService.getState().viewports.get(viewportId);
    return (viewport?.displaySetInstanceUIDs ?? []).some(uid => {
      const displaySet = displaySetService.getDisplaySetByUID(uid);
      const frames = displaySet?.numImageFrames ?? displaySet?.instances?.length ?? 0;
      return frames > 1 || !!displaySet?.isDynamicVolume;
    });
  };

  const actions = {
    toggleCinePlayback: () => {
      const { activeViewportId } = viewportGridService.getState();
      if (!activeViewportId || !canPlay(activeViewportId)) {
        return;
      }
      const { isCineEnabled, cines } = cineService.getState();
      const isPlaying = isCineEnabled && !!cines?.[activeViewportId]?.isPlaying;
      cineService.setCine({ id: activeViewportId, isPlaying: !isPlaying });
      if (!isCineEnabled) {
        cineService.setIsCineEnabled(true);
      }
    },
  };

  return {
    actions,
    definitions: {
      toggleCinePlayback: { commandFn: actions.toggleCinePlayback },
    },
    defaultContext: 'DEFAULT',
  };
}

export default getCommandsModule;
