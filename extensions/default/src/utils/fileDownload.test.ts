import { base64ToBlob, isIOS, prepareDownloadTarget } from './fileDownload';

describe('fileDownload', () => {
  it('decodes base64 with and without a data: prefix', () => {
    const raw = btoa('%PDF-1.4 test');
    for (const input of [raw, `data:application/pdf;base64,${raw}`]) {
      const blob = base64ToBlob(input);
      expect(blob.type).toBe('application/pdf');
      expect(blob.size).toBe('%PDF-1.4 test'.length);
    }
  });

  it('keeps the mime type from the data: prefix', () => {
    expect(base64ToBlob(`data:application/zip;base64,${btoa('PK')}`).type).toBe('application/zip');
  });

  it('only pre-opens a tab on iOS unless asked to', () => {
    const open = jest.spyOn(window, 'open').mockReturnValue(null);
    expect(isIOS()).toBe(false);
    expect(prepareDownloadTarget()).toBeNull();
    expect(open).not.toHaveBeenCalled();
    prepareDownloadTarget(true);
    expect(open).toHaveBeenCalledWith('', '_blank');
    open.mockRestore();
  });
});
