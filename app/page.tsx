import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center text-white">
      <h1 className="text-6xl font-bold mb-4">바둑</h1>
      <p className="text-xl text-gray-400 mb-12">Baduk - The Game of Go</p>

      <div className="flex flex-col gap-4">
        <Link
          href="/game?size=9"
          className="px-8 py-4 bg-amber-700 hover:bg-amber-600 rounded-lg text-center text-lg font-medium transition-colors"
        >
          9 x 9
        </Link>
        <Link
          href="/game?size=13"
          className="px-8 py-4 bg-amber-700 hover:bg-amber-600 rounded-lg text-center text-lg font-medium transition-colors"
        >
          13 x 13
        </Link>
        <Link
          href="/game?size=19"
          className="px-8 py-4 bg-amber-700 hover:bg-amber-600 rounded-lg text-center text-lg font-medium transition-colors"
        >
          19 x 19
        </Link>
      </div>
    </main>
  );
}
