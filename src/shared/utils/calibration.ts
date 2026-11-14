// Calibração de sensores (SCRUM-600). A estação envia a leitura bruta e o
// tratamento converte para a unidade do tipo:
//   valor = bruto × fator × ganho + offset
// Fator é a conversão padrão do tipo; ganho e offset são a calibração, e os do
// sensor valem no lugar dos do tipo. Campo nulo não altera a leitura.

type CalibrationValue = number | null | undefined;

/** Fator e ganho multiplicam a leitura: zero apagaria toda medição. */
export function isValidMultiplier(value: CalibrationValue): boolean {
  return value === null || value === undefined
    ? true
    : Number.isFinite(value) && value !== 0;
}

export function isValidOffset(value: CalibrationValue): boolean {
  return value === null || value === undefined ? true : Number.isFinite(value);
}

export interface Calibration {
  factor?: CalibrationValue;
  gain?: CalibrationValue;
  offset_value?: CalibrationValue;
}

/** Nome do primeiro campo inválido, ou null quando a calibração é aceita. */
export function invalidCalibrationField(
  calibration: Calibration,
): keyof Calibration | null {
  if (!isValidMultiplier(calibration.factor)) return "factor";
  if (!isValidMultiplier(calibration.gain)) return "gain";
  if (!isValidOffset(calibration.offset_value)) return "offset_value";
  return null;
}
