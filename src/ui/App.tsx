import { Component, ReactNode, useState } from 'react';
import { ctl } from './controller';
import { Game } from './Game';
import { MainMenu } from './MainMenu';

/** Affiche un message clair plutôt qu'un écran blanc en cas d'erreur d'interface. */
class Boundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="crash">
        <h1>Une erreur est survenue</h1>
        <p>{this.state.error.message}</p>
        <p>Votre dernière sauvegarde automatique est intacte.</p>
        <button className="primary" onClick={() => location.reload()}>Recharger le jeu</button>
      </div>
    );
  }
}

export function App() {
  const [inGame, setInGame] = useState(false);
  return (
    <Boundary>
      {inGame ? <Game onQuit={() => { ctl.stop(); setInGame(false); }} /> : <MainMenu onStart={() => setInGame(true)} />}
    </Boundary>
  );
}
