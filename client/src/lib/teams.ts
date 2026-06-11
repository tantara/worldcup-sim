export type Player = {
  number: number;
  name: string;
  position: "GK" | "DF" | "MF" | "FW";
};

export type Team = {
  id: string;
  name: string;
  flag: string;
  /** Overall strength, roughly 60-95. Drives the simulation. */
  rating: number;
  manager: string;
  formation: string;
  colors: { primary: string; secondary: string };
  squad: Player[];
};

export const TEAMS: Team[] = [
  {
    id: "bra",
    name: "Brazil",
    flag: "🇧🇷",
    rating: 91,
    manager: "Dorival Júnior",
    formation: "4-2-3-1",
    colors: { primary: "#f7d117", secondary: "#1c8a43" },
    squad: [
      { number: 1, name: "Alisson", position: "GK" },
      { number: 2, name: "Danilo", position: "DF" },
      { number: 3, name: "Marquinhos", position: "DF" },
      { number: 4, name: "Gabriel Magalhães", position: "DF" },
      { number: 6, name: "Wendell", position: "DF" },
      { number: 5, name: "Bruno Guimarães", position: "MF" },
      { number: 8, name: "Lucas Paquetá", position: "MF" },
      { number: 10, name: "Rodrygo", position: "MF" },
      { number: 7, name: "Vinícius Jr.", position: "FW" },
      { number: 11, name: "Raphinha", position: "FW" },
      { number: 9, name: "Endrick", position: "FW" },
    ],
  },
  {
    id: "arg",
    name: "Argentina",
    flag: "🇦🇷",
    rating: 92,
    manager: "Lionel Scaloni",
    formation: "4-3-3",
    colors: { primary: "#75aadb", secondary: "#ffffff" },
    squad: [
      { number: 23, name: "Emiliano Martínez", position: "GK" },
      { number: 4, name: "Gonzalo Montiel", position: "DF" },
      { number: 13, name: "Cristian Romero", position: "DF" },
      { number: 19, name: "Nicolás Otamendi", position: "DF" },
      { number: 3, name: "Nicolás Tagliafico", position: "DF" },
      { number: 7, name: "Rodrigo De Paul", position: "MF" },
      { number: 5, name: "Enzo Fernández", position: "MF" },
      { number: 20, name: "Alexis Mac Allister", position: "MF" },
      { number: 11, name: "Ángel Di María", position: "FW" },
      { number: 10, name: "Lionel Messi", position: "FW" },
      { number: 22, name: "Lautaro Martínez", position: "FW" },
    ],
  },
  {
    id: "fra",
    name: "France",
    flag: "🇫🇷",
    rating: 91,
    manager: "Didier Deschamps",
    formation: "4-2-3-1",
    colors: { primary: "#1e3a8a", secondary: "#ffffff" },
    squad: [
      { number: 1, name: "Mike Maignan", position: "GK" },
      { number: 2, name: "Jules Koundé", position: "DF" },
      { number: 4, name: "Dayot Upamecano", position: "DF" },
      { number: 5, name: "William Saliba", position: "DF" },
      { number: 22, name: "Theo Hernández", position: "DF" },
      { number: 8, name: "Aurélien Tchouaméni", position: "MF" },
      { number: 14, name: "Adrien Rabiot", position: "MF" },
      { number: 7, name: "Antoine Griezmann", position: "MF" },
      { number: 11, name: "Ousmane Dembélé", position: "FW" },
      { number: 10, name: "Kylian Mbappé", position: "FW" },
      { number: 9, name: "Marcus Thuram", position: "FW" },
    ],
  },
  {
    id: "eng",
    name: "England",
    flag: "🏴󠁧󠁢󠁥󠁮󠁧󠁿",
    rating: 89,
    manager: "Thomas Tuchel",
    formation: "4-2-3-1",
    colors: { primary: "#ffffff", secondary: "#cf0a2c" },
    squad: [
      { number: 1, name: "Jordan Pickford", position: "GK" },
      { number: 2, name: "Kyle Walker", position: "DF" },
      { number: 5, name: "John Stones", position: "DF" },
      { number: 6, name: "Marc Guéhi", position: "DF" },
      { number: 3, name: "Luke Shaw", position: "DF" },
      { number: 4, name: "Declan Rice", position: "MF" },
      { number: 8, name: "Jude Bellingham", position: "MF" },
      { number: 10, name: "Cole Palmer", position: "MF" },
      { number: 7, name: "Bukayo Saka", position: "FW" },
      { number: 9, name: "Harry Kane", position: "FW" },
      { number: 11, name: "Phil Foden", position: "FW" },
    ],
  },
  {
    id: "esp",
    name: "Spain",
    flag: "🇪🇸",
    rating: 90,
    manager: "Luis de la Fuente",
    formation: "4-3-3",
    colors: { primary: "#c60b1e", secondary: "#ffc400" },
    squad: [
      { number: 23, name: "Unai Simón", position: "GK" },
      { number: 2, name: "Dani Carvajal", position: "DF" },
      { number: 14, name: "Aymeric Laporte", position: "DF" },
      { number: 4, name: "Robin Le Normand", position: "DF" },
      { number: 24, name: "Marc Cucurella", position: "DF" },
      { number: 16, name: "Rodri", position: "MF" },
      { number: 8, name: "Fabián Ruiz", position: "MF" },
      { number: 26, name: "Pedri", position: "MF" },
      { number: 11, name: "Nico Williams", position: "FW" },
      { number: 9, name: "Álvaro Morata", position: "FW" },
      { number: 19, name: "Lamine Yamal", position: "FW" },
    ],
  },
  {
    id: "ger",
    name: "Germany",
    flag: "🇩🇪",
    rating: 88,
    manager: "Julian Nagelsmann",
    formation: "4-2-3-1",
    colors: { primary: "#000000", secondary: "#dd0000" },
    squad: [
      { number: 1, name: "Manuel Neuer", position: "GK" },
      { number: 6, name: "Joshua Kimmich", position: "DF" },
      { number: 2, name: "Antonio Rüdiger", position: "DF" },
      { number: 23, name: "Jonathan Tah", position: "DF" },
      { number: 3, name: "David Raum", position: "DF" },
      { number: 8, name: "Robert Andrich", position: "MF" },
      { number: 21, name: "İlkay Gündoğan", position: "MF" },
      { number: 10, name: "Jamal Musiala", position: "MF" },
      { number: 17, name: "Florian Wirtz", position: "MF" },
      { number: 7, name: "Kai Havertz", position: "FW" },
      { number: 9, name: "Niclas Füllkrug", position: "FW" },
    ],
  },
  {
    id: "por",
    name: "Portugal",
    flag: "🇵🇹",
    rating: 89,
    manager: "Roberto Martínez",
    formation: "4-3-3",
    colors: { primary: "#006600", secondary: "#cc0000" },
    squad: [
      { number: 1, name: "Diogo Costa", position: "GK" },
      { number: 20, name: "João Cancelo", position: "DF" },
      { number: 3, name: "Pepe", position: "DF" },
      { number: 4, name: "Rúben Dias", position: "DF" },
      { number: 19, name: "Nuno Mendes", position: "DF" },
      { number: 18, name: "Rúben Neves", position: "MF" },
      { number: 8, name: "Bruno Fernandes", position: "MF" },
      { number: 16, name: "Vitinha", position: "MF" },
      { number: 11, name: "Rafael Leão", position: "FW" },
      { number: 7, name: "Cristiano Ronaldo", position: "FW" },
      { number: 21, name: "Diogo Jota", position: "FW" },
    ],
  },
  {
    id: "ned",
    name: "Netherlands",
    flag: "🇳🇱",
    rating: 87,
    manager: "Ronald Koeman",
    formation: "4-3-3",
    colors: { primary: "#f36c21", secondary: "#ffffff" },
    squad: [
      { number: 1, name: "Bart Verbruggen", position: "GK" },
      { number: 22, name: "Denzel Dumfries", position: "DF" },
      { number: 4, name: "Virgil van Dijk", position: "DF" },
      { number: 3, name: "Matthijs de Ligt", position: "DF" },
      { number: 17, name: "Daley Blind", position: "DF" },
      { number: 6, name: "Jordan Henderson", position: "MF" },
      { number: 8, name: "Tijjani Reijnders", position: "MF" },
      { number: 14, name: "Frenkie de Jong", position: "MF" },
      { number: 11, name: "Cody Gakpo", position: "FW" },
      { number: 9, name: "Memphis Depay", position: "FW" },
      { number: 10, name: "Xavi Simons", position: "FW" },
    ],
  },
];

export function getTeam(id: string): Team {
  const team = TEAMS.find((t) => t.id === id);
  if (!team) throw new Error(`Unknown team: ${id}`);
  return team;
}
