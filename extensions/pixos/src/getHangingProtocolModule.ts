import hpPairedViews from './hpPairedViews';

export default function getHangingProtocolModule() {
  return [{ name: hpPairedViews.id, protocol: hpPairedViews }];
}
