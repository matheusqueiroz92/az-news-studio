/**
 * Sucesso de uma operação de domínio.
 * Falha esperada não lança exceção: ela volta como `Err`.
 */
export type Ok<T> = {
  readonly ok: true;
  readonly value: T;
};

/** Falha esperada, com o erro tipado em `error`. */
export type Err<E> = {
  readonly ok: false;
  readonly error: E;
};

/** Ou um valor, ou um erro. O fluxo esperado não usa `throw`. */
export type Result<T, E> = Ok<T> | Err<E>;

/** Constrói um sucesso. */
export function ok<T>(value: T): Ok<T> {
  return { ok: true, value };
}

/** Constrói uma falha. O código de erro fica em `error`, sem exceção. */
export function err<E>(error: E): Err<E> {
  return { ok: false, error };
}

/** Verdadeiro no sucesso, sem lançar. */
export function isOk<T, E>(result: Result<T, E>): result is Ok<T> {
  return result.ok;
}

/** Verdadeiro na falha, sem lançar. */
export function isErr<T, E>(result: Result<T, E>): result is Err<E> {
  return !result.ok;
}

/**
 * Transforma o valor de um sucesso.
 * Na falha, devolve o mesmo erro: o código não muda.
 */
export function map<T, E, U>(
  result: Result<T, E>,
  fn: (value: T) => U,
): Result<U, E> {
  if (isErr(result)) {
    return result;
  }

  return ok(fn(result.value));
}
