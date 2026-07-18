import typer

app = typer.Typer(no_args_is_help=True)

@app.command()
def status() -> None:
    """Report scaffold status."""
    typer.echo("PBGC Case Workbench 2 scaffold is installed.")

if __name__ == "__main__":
    app()
