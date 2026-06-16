
import React, { useState, useEffect, useRef } from 'react';
import './app-loader.scss';

interface AppLoaderProps {
    onLoadingComplete: () => void;
}

const AppLoader: React.FC<AppLoaderProps> = ({ onLoadingComplete }) => {
    const [show, setShow] = useState(true);
    const clangSoundRef = useRef<HTMLAudioElement | null>(null);
    const sirenSoundRef = useRef<HTMLAudioElement | null>(null);

    useEffect(() => {
        try {
            sirenSoundRef.current = new Audio('/assets/media/siren.mp3');
            sirenSoundRef.current.loop = true;
            sirenSoundRef.current.volume = 0.2;
        } catch (e) {
            console.error('Siren sound not found.');
        }

        try {
            clangSoundRef.current = new Audio('/assets/media/clang.mp3');
            clangSoundRef.current.volume = 0.6;
        } catch (e) {
            console.error('Clang sound not found.');
        }

        const clangTimer = setTimeout(() => {
            clangSoundRef.current?.play().catch(() => console.warn('Clang sound blocked'));
        }, 1500);

        const sirenTimer = setTimeout(() => {
            sirenSoundRef.current?.play().catch(() => console.warn('Siren sound autoplay blocked.'));
        }, 1500);

        const sequenceTimer = setTimeout(() => {
            setShow(false);
            if (sirenSoundRef.current) {
                let vol = sirenSoundRef.current.volume;
                const fadeOut = setInterval(() => {
                    if (vol > 0.05) {
                        vol -= 0.05;
                        sirenSoundRef.current!.volume = vol;
                    } else {
                        sirenSoundRef.current?.pause();
                        clearInterval(fadeOut);
                    }
                }, 100);
            }
            onLoadingComplete();
        }, 4000);

        return () => {
            clearTimeout(clangTimer);
            clearTimeout(sirenTimer);
            clearTimeout(sequenceTimer);
            sirenSoundRef.current?.pause();
            clangSoundRef.current?.pause();
        };
    }, [onLoadingComplete]);

    if (!show) return null;

    return (
        <div className='gta-loader'>
            <div className='scene'>
                <div className='siren-light red'></div>
                <div className='siren-light blue'></div>
                <div className='wet-ground'></div>
            </div>

            <div className='loader-particles'>
                {[...Array(20)].map((_, i) => (
                    <div key={i} className={`loader-particle loader-particle--${i + 1}`} />
                ))}
            </div>

            <div className='logo-container'>
                <div className='logo-img-wrap'>
                    <img src='/freezy-logo.png' alt='Freezy Trading Hub' className='loader-logo-img' />
                    <div className='logo-glow-ring' />
                </div>
                <h1 className='logo-text'>FREEZY TRADING HUB</h1>
                <div className='logo-tagline'>POWERED BY DERIV</div>
            </div>

            <p className='subtitle subtitle-1'>&gt; Initializing Trading Matrix...</p>
            <p className='subtitle subtitle-2'>&gt; Loading Strategies: Martingale, D'Alembert, Oscar's Grind...</p>
            <p className='subtitle subtitle-3'>&gt; Activating AI Core: Version 2.0</p>
            <p className='subtitle subtitle-4'>&gt; Real-time Analytics &amp; Reporting</p>
            <p className='subtitle subtitle-5'>&gt; Welcome, Trader.</p>

            <div className='film-grain'></div>
            <div className='vignette'></div>
            <div className='scanlines'></div>
        </div>
    );
};

export default AppLoader;
