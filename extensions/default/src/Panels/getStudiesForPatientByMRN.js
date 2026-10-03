async function getStudiesForPatientByMRN(dataSource, qidoForStudyUID) {
  if (!qidoForStudyUID?.length) {
    return [];
  }

  const mrn = qidoForStudyUID[0].mrn;

  // if not defined or empty, return the original qidoForStudyUID
  if (!mrn) {
    return qidoForStudyUID;
  }

  const studies = await dataSource.query.studies.search({
    patientId: mrn,
    disableWildcard: true,
  });

  // A server that cannot match this MRN (e.g. one containing "/" on Orthanc)
  // returns nothing, which would leave the study browser empty even though the
  // study being viewed is known. Fall back to it.
  return studies?.length ? studies : qidoForStudyUID;
}

export default getStudiesForPatientByMRN;
