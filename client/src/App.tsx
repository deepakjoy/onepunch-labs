'use client';

import { useState } from 'react';
import { Dialog, DialogBackdrop, DialogPanel, TransitionChild } from '@headlessui/react';
import { Routes, Route, Link, useLocation } from 'react-router-dom';
import {
  Bars3Icon,
  CalendarIcon,
  FolderIcon,
  HomeIcon,
  XMarkIcon,
  PuzzlePieceIcon,
} from '@heroicons/react/24/outline';
import VoiceCoach from '@components/VoiceCoach';
import FishTank from '@components/FishTank';
import BoardGame from '@components/BoardGame';

type NavigationItem = {
  name: string;
  href: string;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  current?: boolean;
};

const navigation: NavigationItem[] = [
  { name: 'Home', href: '/', icon: HomeIcon },
  { name: 'Voice coach', href: '/voice-coach', icon: FolderIcon },
  { name: 'Fish Tank', href: '/fish-tank', icon: CalendarIcon },
  { name: 'Board Game', href: '/board-game', icon: PuzzlePieceIcon },
];
const projects = [
  { id: 1, name: 'Voice Coach', href: '#', initial: 'H', current: false },
  { id: 2, name: 'Fish Tank', href: '#', initial: 'H', current: false },
];

function classNames(...classes: string[]) {
  return classes.filter(Boolean).join(' ');
}

export default function Example() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();
  // Determine which nav item is current based on location.pathname
  const navWithCurrent: NavigationItem[] = navigation.map((item) => {
    if (item.href === '/') {
      return { ...item, current: location.pathname === '/' };
    }
    return { ...item, current: location.pathname.startsWith(item.href) };
  });

  return (
    <div>
      <Dialog open={sidebarOpen} onClose={setSidebarOpen} className="relative z-50 lg:hidden">
        <DialogBackdrop
          transition
          className="fixed inset-0 bg-gray-900/80 transition-opacity duration-300 ease-linear data-closed:opacity-0"
        />

        <div className="fixed inset-0 flex">
          <DialogPanel
            transition
            className="relative mr-16 flex w-full max-w-xs flex-1 transform transition duration-300 ease-in-out data-closed:-translate-x-full"
          >
            <TransitionChild>
              <div className="absolute top-0 left-full flex w-16 justify-center pt-5 duration-300 ease-in-out data-closed:opacity-0">
                <button
                  type="button"
                  onClick={() => setSidebarOpen(false)}
                  className="-m-2.5 p-2.5"
                >
                  <span className="sr-only">Close sidebar</span>
                  <XMarkIcon aria-hidden="true" className="size-6 text-white" />
                </button>
              </div>
            </TransitionChild>
            {/* Sidebar component, swap this element with another sidebar if you like */}
            <div className="flex grow flex-col gap-y-5 overflow-y-auto bg-indigo-600 px-6 pb-2">
              <div className="flex h-16 shrink-0 items-center">
                <img
                  alt="Your Company"
                  src="https://tailwindcss.com/plus-assets/img/logos/mark.svg?color=white"
                  className="h-8 w-auto"
                />
              </div>
              <nav className="flex flex-1 flex-col">
                <ul role="list" className="flex flex-1 flex-col gap-y-7">
                  <li>
                    <ul role="list" className="-mx-2 space-y-1">
                      {navWithCurrent.map((item) => (
                        <li key={item.name}>
                          <Link
                            to={item.href}
                            className={classNames(
                              item.current
                                ? 'bg-indigo-700 text-white'
                                : 'text-indigo-200 hover:bg-indigo-700 hover:text-white',
                              'group flex gap-x-3 rounded-md p-2 text-sm/6 font-semibold',
                            )}
                          >
                            <item.icon
                              aria-hidden="true"
                              className={classNames(
                                item.current
                                  ? 'text-white'
                                  : 'text-indigo-200 group-hover:text-white',
                                'size-6 shrink-0',
                              )}
                            />
                            {item.name}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </li>
                  <li>
                    <div className="text-xs/6 font-semibold text-indigo-200">Projects</div>
                    <ul role="list" className="-mx-2 mt-2 space-y-1">
                      {projects.map((team) => (
                        <li key={team.name}>
                          <a
                            href={team.href}
                            className={classNames(
                              team.current
                                ? 'bg-indigo-700 text-white'
                                : 'text-indigo-200 hover:bg-indigo-700 hover:text-white',
                              'group flex gap-x-3 rounded-md p-2 text-sm/6 font-semibold',
                            )}
                          >
                            <span className="flex size-6 shrink-0 items-center justify-center rounded-lg border border-indigo-400 bg-indigo-500 text-[0.625rem] font-medium text-white">
                              {team.initial}
                            </span>
                            <span className="truncate">{team.name}</span>
                          </a>
                        </li>
                      ))}
                    </ul>
                  </li>
                </ul>
              </nav>
            </div>
          </DialogPanel>
        </div>
      </Dialog>

      {/* Static sidebar for desktop */}
      <div className="hidden lg:fixed lg:inset-y-0 lg:z-50 lg:flex lg:w-72 lg:flex-col">
        {/* Sidebar component, swap this element with another sidebar if you like */}
        <div className="flex grow flex-col gap-y-5 overflow-y-auto bg-indigo-600 px-6">
          <div className="flex h-16 shrink-0 items-center">
            <img
              alt="Your Company"
              src="https://tailwindcss.com/plus-assets/img/logos/mark.svg?color=white"
              className="h-8 w-auto"
            />
          </div>
          <nav className="flex flex-1 flex-col">
            <ul role="list" className="flex flex-1 flex-col gap-y-7">
              <li>
                <ul role="list" className="-mx-2 space-y-1">
                  {navWithCurrent.map((item) => (
                    <li key={item.name}>
                      <Link
                        to={item.href}
                        className={classNames(
                          item.current
                            ? 'bg-indigo-700 text-white'
                            : 'text-indigo-200 hover:bg-indigo-700 hover:text-white',
                          'group flex gap-x-3 rounded-md p-2 text-sm/6 font-semibold',
                        )}
                      >
                        <item.icon
                          aria-hidden="true"
                          className={classNames(
                            item.current ? 'text-white' : 'text-indigo-200 group-hover:text-white',
                            'size-6 shrink-0',
                          )}
                        />
                        {item.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              </li>
              {/* {<li>
                <div className="text-xs/6 font-semibold text-indigo-200">Project showcase</div>
                <ul role="list" className="-mx-2 mt-2 space-y-1">
                  {projects.map((team) => (
                    <li key={team.name}>
                      <a
                        href={team.href}
                        className={classNames(
                          team.current
                            ? 'bg-indigo-700 text-white'
                            : 'text-indigo-200 hover:bg-indigo-700 hover:text-white',
                          'group flex gap-x-3 rounded-md p-2 text-sm/6 font-semibold',
                        )}
                      >
                        <span className="flex size-6 shrink-0 items-center justify-center rounded-lg border border-indigo-400 bg-indigo-500 text-[0.625rem] font-medium text-white">
                          {team.initial}
                        </span>
                        <span className="truncate">{team.name}</span>
                      </a>
                    </li>
                  ))}
                </ul>
              </li>} */}
              <li className="-mx-6 mt-auto">
                <a
                  href="#"
                  className="flex items-center gap-x-4 px-6 py-3 text-sm/6 font-semibold text-white hover:bg-indigo-700"
                >
                  <img
                    alt=""
                    src="https://pbs.twimg.com/profile_images/1506140174895685639/6YpMGBAq_400x400.jpg"
                    className="size-8 rounded-full bg-indigo-700"
                  />
                  <span className="sr-only">Your profile</span>
                  <span aria-hidden="true">Deepak Cheenath</span>
                </a>
              </li>
            </ul>
          </nav>
        </div>
      </div>

      <div className="sticky top-0 z-40 flex items-center gap-x-6 bg-indigo-600 px-4 py-4 shadow-xs sm:px-6 lg:hidden">
        <button
          type="button"
          onClick={() => setSidebarOpen(true)}
          className="-m-2.5 p-2.5 text-indigo-200 lg:hidden"
        >
          <span className="sr-only">Open sidebar</span>
          <Bars3Icon aria-hidden="true" className="size-6" />
        </button>
        <div className="flex-1 text-sm/6 font-semibold text-white">Dashboard</div>
        <a href="#">
          <span className="sr-only">Your profile</span>
          <img
            alt=""
            src="https://pbs.twimg.com/profile_images/1506140174895685639/6YpMGBAq_400x400.jpg"
            className="size-8 rounded-full bg-indigo-700"
          />
        </a>
      </div>

      <main className="lg:pl-72">
        <Routes>
          <Route path="/" element={<div className="px-4 sm:px-6 lg:px-8">Home</div>} />
          <Route path="/voice-coach" element={<VoiceCoach />} />
          <Route path="/fish-tank" element={<FishTank />} />
          <Route path="/board-game" element={<BoardGame />} />
        </Routes>
      </main>
    </div>
  );
}
