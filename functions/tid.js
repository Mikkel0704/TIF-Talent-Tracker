// Skal importeres FOERST. Appens pointkode bruger lokal tid (startOfWeek, startOfMonth,
// dagsISO, iDagISO), og i browseren er lokal tid dansk tid. Paa serveren er den UTC,
// medmindre vi siger andet - og saa ville en registrering mandag kl. 00:30 havne i
// forrige uge. Node laeser TZ igen, naar den saettes, men vi saetter den foer al Date-brug.
process.env.TZ = "Europe/Copenhagen";
export const TIDSZONE = process.env.TZ;
