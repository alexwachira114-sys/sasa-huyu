import React, { useState, useEffect, useRef } from 'react';
import './app-loader.scss';

interface AppLoaderProps {
    onLoadingComplete: () => void;
    duration?: number;
}

const AppLoader: React.FC<AppLoaderProps> = ({ onLoadingComplete, duration = 5000 }) => {
    const [progress, setProgress] = useState(0);
    const [phase, setPhase] = useState<'intro' | 'loading' | 'complete'>('intro');
    const [showCrack, setShowCrack] = useState(false);
    const engineSoundRef = useRef<HTMLAudioElement | null>(null);
    const crackSoundRef = useRef<HTMLAudioElement | null>(null);

    useEffect(() => {
        try {
            engineSoundRef.current = new Audio('/sounds/engine.mp3');
            engineSoundRef.current.volume = 0.4;
            engineSoundRef.current.loop = true;
            engineSoundRef.current.play().catch(() => {});
        } catch (e) {
            console.log('Engine sound not found');
        }

        return () => {
            if (engineSoundRef.current) {
                engineSoundRef.current.pause();
            }
        };
    }, []);

    useEffect(() => {
        const introTimer = setTimeout(() => {
            setPhase('loading');
        }, 800);

        return () => clearTimeout(introTimer);
    }, []);

    useEffect(() => {
        if (phase !== 'loading') return;

        const interval = setInterval(() => {
            setProgress(prev => {
                if (prev >= 100) {
                    clearInterval(interval);
                    return 100;
                }
                return prev + 1;
            });
        }, duration / 100);

        return () => clearInterval(interval);
    }, [phase, duration]);

    useEffect(() => {
        if (progress >= 100) {
            setPhase('complete');
            
            if (engineSoundRef.current) {
                engineSoundRef.current.pause();
            }
            
            try {
                crackSoundRef.current = new Audio('/sounds/glass_crack.mp3');
                crackSoundRef.current.volume = 0.6;
                crackSoundRef.current.play().catch(() => {});
            } catch (e) {
                console.log('Crack sound not found');
            }

            setShowCrack(true);

            setTimeout(() => {
                onLoadingComplete();
            }, 800);
        }
    }, [progress, onLoadingComplete]);

    return (
        <div className='makoti-loader'>
            <div className='loader-bg'>
                <div className='loader-grid' />
                <div className='loader-glow loader-glow--1' />
                <div className='loader-glow loader-glow--2' />
            </div>

            <div className={`loader-content ${phase === 'complete' ? 'loader-content--exit' : ''}`}>
                <div className={`loader-logo ${phase !== 'intro' ? 'loader-logo--visible' : ''}`}>
                    <div className='logo-ring'>
                        <div className='logo-ring-inner' />
                    </div>
                    <div className='logo-icon'>
                        <svg viewBox='0 0 24 24' fill='none'>
                            <path d='M13 3L4 14H12L11 21L20 10H12L13 3Z' stroke='currentColor' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round'/>
                        </svg>
                    </div>
                </div>

                <div className={`loader-text ${phase !== 'intro' ? 'loader-text--visible' : ''}`}>
                    <h1 className='loader-title'>MAKOTI</h1>
                    <p className='loader-subtitle'>TRADING SYSTEM</p>
                </div>

                <div className={`loader-features ${phase === 'loading' ? 'loader-features--visible' : ''}`}>
                    <div className='feature'>
                        <span className='feature-icon'>⚡</span>
                        <span>AI Prediction</span>
                    </div>
                    <div className='feature'>
                        <span className='feature-icon'>🎯</span>
                        <span>Smart Analysis</span>
                    </div>
                    <div className='feature'>
                        <span className='feature-icon'>🚀</span>
                        <span>Auto Trading</span>
                    </div>
                </div>

                <div className={`loader-progress ${phase === 'loading' ? 'loader-progress--visible' : ''}`}>
                    <div className='progress-track'>
                        <div className='progress-fill' style={{ width: `${progress}%` }}>
                            <div className='progress-glow' />
                        </div>
                    </div>
                    <div className='progress-info'>
                        <span className='progress-percent'>{progress}%</span>
                        <span className='progress-status'>
                            {progress < 25 && 'Initializing...'}
                            {progress >= 25 && progress < 50 && 'Loading engine...'}
                            {progress >= 50 && progress < 75 && 'Connecting...'}
                            {progress >= 75 && progress < 100 && 'Almost ready...'}
                            {progress === 100 && 'Complete!'}
                        </span>
                    </div>
                </div>
            </div>

            {showCrack && (
                <div className='crack-overlay'>
                    <div className='crack-line crack-line--1' />
                    <div className='crack-line crack-line--2' />
                    <div className='crack-line crack-line--3' />
                    <div className='crack-line crack-line--4' />
                </div>
            )}

            <div className='loader-particles'>
                {Array.from({ length: 30 }).map((_, i) => (
                    <div
                        key={i}
                        className='loader-particle'
                        style={{
                            left: `${Math.random() * 100}%`,
                            animationDelay: `${Math.random() * 2}s`,
                            animationDuration: `${2 + Math.random() * 2}s`,
                        }}
                    />
                ))}
            </div>

            <div className='loader-footer'>
                <p>Powered by Deriv</p>
            </div>
        </div>
    );
};

export default AppLoader;
