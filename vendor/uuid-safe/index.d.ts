export const NIL: string;
export function parse(id: string): Uint8Array;
export function stringify(bytes: ArrayLike<number>, offset?: number): string;
export function validate(value: unknown): value is string;
export function version(id: string): number;
export function v4(options?: { random?: Uint8Array | number[] }, buf?: ArrayLike<number>, offset?: number): string | ArrayLike<number>;
export function v1(): never;
export function v3(): never;
export function v5(): never;
