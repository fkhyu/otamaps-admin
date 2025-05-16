import Image from "next/image";

export default function Home() {
  return (
    <div className="grid grid-rows-[20px_1fr_20px] items-cente justify-items-center min-h-screen p-8 pb-20 gap-16 sm:p-20 font-[family-name:var(--font-geist-sans)]">
      <div id="sidebar" className="absolute flex top-0 left-0 right-0 bottom-0 w-1/5 p-4 bg-gray-100 min-w-[250px] h-screen">
        <ul className="w-full flex flex-col gap-2">
          <li className="py-2 px-4 h-fit rounded-md w-full">
            <a href="/">Dash</a>
          </li>
          <li className="py-2 px-4 h-fit rounded-md w-full">
            <a href="/mapEditor">Map Editor</a>
          </li>
        </ul>
      </div>
    </div>
  );
}
