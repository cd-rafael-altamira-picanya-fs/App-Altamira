import { useEffect, useState } from "react";
import { db } from "./firebase";
import { collection, getDocs } from "firebase/firestore";

export default function App() {
  const [estadoDb, setEstadoDb] = useState("Comprobando conexión...");

  useEffect(() => {
    async function comprobarConexion() {
      try {
        await getDocs(collection(db, "club"));
        setEstadoDb("Conectado a Firebase Firestore");
      } catch (error) {
        setEstadoDb("Revisar reglas o claves de Firebase");
      }
    }
    comprobarConexion();
  }, []);

  return (
    <main style={{ padding: "24px", maxWidth: "600px", margin: "0 auto" }}>
      <h1>C.D. Rafael Altamira Picanya FS</h1>
      <p style={{ marginTop: "12px" }}>Aplicación web progresiva (PWA) del club.</p>
      <p style={{ marginTop: "16px", fontWeight: "bold" }}>{estadoDb}</p>
    </main>
  );
}
