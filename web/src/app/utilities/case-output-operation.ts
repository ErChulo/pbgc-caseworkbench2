export interface CaseOutputOperationToken {
  readonly id: symbol;
  readonly revision: number;
}

/** Same-session coordination only; it is not a filesystem transaction or cross-window lock. */
export class CaseOutputOperationGuard {
  private revision = 0;
  private active: symbol | null = null;

  changed(): void {
    this.revision += 1;
  }
  isBusy(): boolean {
    return this.active !== null;
  }
  begin(): CaseOutputOperationToken | null {
    if (this.active !== null) return null;
    const token = {
      id: Symbol("case-output-operation"),
      revision: this.revision,
    };
    this.active = token.id;
    return token;
  }
  current(token: CaseOutputOperationToken): boolean {
    return this.active === token.id && this.revision === token.revision;
  }
  finish(token: CaseOutputOperationToken): void {
    if (this.active === token.id) this.active = null;
  }
}
