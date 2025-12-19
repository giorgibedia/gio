/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React from 'react';
import { useTranslations } from '../useTranslations';
import { MagicWandIcon, SparkleIcon, UsersIcon, PhotoIcon, CloudArrowUpIcon } from './icons';

const AboutScreen: React.FC = () => {
  const { t } = useTranslations();

  const formatBold = (text: string) => {
    const parts = text.split(/(\*\*.*?\*\*)/g);
    return parts.map((part, index) => {
        if (part.startsWith('**') && part.endsWith('**')) {
            return <strong key={index} className="text-[var(--color-primary-400)]">{part.slice(2, -2)}</strong>;
        }
        return part;
    });
  };
  
  const teamMembers = t('aboutCredits').split('|').map(personString => {
    const [name, role] = personString.split(':');
    return { name: name.trim(), role: role.trim() };
  });

  const features = [
    {
      icon: <MagicWandIcon className="w-8 h-8 text-white" />,
      gradient: 'from-blue-500 to-cyan-400',
      shadow: 'shadow-blue-500/30',
      title: t('aboutRetouchTitle' as any),
      description: t('aboutRetouchDescription' as any),
      hoverBorder: 'hover:border-blue-400/50',
    },
    {
      icon: <PhotoIcon className="w-8 h-8 text-white" />,
      gradient: 'from-indigo-500 to-purple-400',
      shadow: 'shadow-indigo-500/30',
      title: t('aboutBackgroundChangeTitle' as any),
      description: t('aboutBackgroundChangeDescription' as any),
      hoverBorder: 'hover:border-indigo-400/50',
    },
    {
      icon: <SparkleIcon className="w-8 h-8 text-white" />,
      gradient: 'from-fuchsia-600 to-pink-500',
      shadow: 'shadow-fuchsia-500/30',
      title: t('aboutMagicTitle' as any),
      description: t('aboutMagicDescription' as any),
      hoverBorder: 'hover:border-fuchsia-400/50',
    },
    {
      icon: <SparkleIcon className="w-8 h-8 text-white" />,
      gradient: 'from-orange-500 to-amber-400',
      shadow: 'shadow-amber-500/30',
      title: t('aboutLogoMakerTitle' as any),
      description: t('aboutLogoMakerDescription' as any),
      hoverBorder: 'hover:border-amber-400/50',
    },
    {
      icon: <CloudArrowUpIcon className="w-8 h-8 text-white" />,
      gradient: 'from-green-500 to-emerald-400',
      shadow: 'shadow-emerald-500/30',
      title: t('aboutCloudTitle' as any),
      description: t('aboutCloudDescription' as any),
      hoverBorder: 'hover:border-emerald-400/50',
    },
  ];
  
  return (
    <div className="w-full max-w-6xl mx-auto p-4 sm:p-8 animate-fade-in">
        <div className="text-center mb-16">
            <h1 className="text-5xl font-extrabold tracking-tight text-gray-100 sm:text-6xl md:text-7xl">
                {t('aboutTitle')}
            </h1>
            <p className="mt-4 text-lg text-gray-400 md:text-xl">{t('aboutSubTitle')}</p>
        </div>
        
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-20">
            {features.map((feature, index) => (
              <div key={index} className={`bg-white/5 backdrop-blur-lg p-8 rounded-2xl border border-white/10 flex flex-col items-start transition-all duration-300 ${feature.hoverBorder} hover:-translate-y-2`}>
                  <div className={`flex items-center justify-center w-16 h-16 bg-gradient-to-br ${feature.gradient} rounded-2xl mb-6 shadow-lg ${feature.shadow}`}>
                      {feature.icon}
                  </div>
                  <h2 className="text-2xl font-bold text-white mb-4">
                      {formatBold(feature.title)}
                  </h2>
                  <p className="text-gray-300 text-base leading-relaxed">
                      {feature.description}
                  </p>
              </div>
            ))}
        </div>
        
        {/* Team Section */}
        <div className="text-center">
            <div className="inline-flex items-center justify-center gap-3 mb-8">
                <UsersIcon className="w-8 h-8 text-gray-400" />
                <h2 className="text-4xl font-bold text-white">{t('aboutTeamTitle')}</h2>
            </div>
            <div className="columns-2 sm:columns-3 lg:columns-5 gap-x-8 gap-y-4 max-w-4xl mx-auto">
              {teamMembers.map((member, index) => (
                <div key={index} className="mb-4 break-inside-avoid text-center p-2">
                  <h3 className="font-bold text-white text-md">{member.name}</h3>
                  <p className="text-xs text-[var(--color-primary-300)]/80 uppercase tracking-wider">{member.role}</p>
                </div>
              ))}
            </div>
        </div>
    </div>
  );
};

export default AboutScreen;