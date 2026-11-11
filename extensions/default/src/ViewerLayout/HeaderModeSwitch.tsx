import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useSystem } from '@ohif/core';

/**
 * «PET/CT» in the header when the study has PET and CT: opens the PET/CT mode (fusion, MIP, SUV, TMTV) with
 * the same study; from there, «Visor» goes back. Hidden for any other study.
 */
const HeaderModeSwitch: React.FC = () => {
  const { servicesManager } = useSystem();
  const { displaySetService } = servicesManager.services;
  const location = useLocation();
  const navigate = useNavigate();
  const [hasPetCt, setHasPetCt] = useState(false);

  useEffect(() => {
    const check = () => {
      const mods = new Set(displaySetService.getActiveDisplaySets().map((ds: any) => ds.Modality));
      setHasPetCt(mods.has('PT') && mods.has('CT'));
    };
    check();
    const { unsubscribe } = displaySetService.subscribe(
      displaySetService.EVENTS.DISPLAY_SETS_ADDED,
      check
    );
    return unsubscribe;
  }, [displaySetService]);

  const inPetCt = /\/tmtv\b/.test(location.pathname);
  if (!hasPetCt && !inPetCt) {
    return null;
  }
  const go = () => {
    const to = inPetCt
      ? location.pathname.replace(/\/tmtv\b/, '/viewer')
      : location.pathname.replace(/\/viewer\b/, '/tmtv');
    navigate({ pathname: to, search: location.search });
  };
  return (
    <button
      type="button"
      onClick={go}
      title={inPetCt ? 'Volver al visor' : 'Abrir en modo PET/CT: fusión, MIP y SUV'}
      className="px-chip"
      data-active={inPetCt || undefined}
    >
      {inPetCt ? 'Visor' : 'PET/CT'}
    </button>
  );
};

export default HeaderModeSwitch;
