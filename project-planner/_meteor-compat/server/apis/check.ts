export function check(value: unknown, template: unknown) {
  if (template === String) {
    if (typeof value == 'string') return true;
  } else if (template === Number) {
    if (typeof value == 'number') return true;
  } else {
    console.log(`TODO: check`, [value, template]);
  }
  throw new Error(`check() failed on "${typeof value}"`);
}
