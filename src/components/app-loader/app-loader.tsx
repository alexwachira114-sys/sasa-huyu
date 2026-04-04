
import React, { useState, useEffect, useRef } from 'react';
import './app-loader.scss';

interface AppLoaderProps {
    onLoadingComplete: () => void;
}

const AppLoader: React.FC<AppLoaderProps> = ({ onLoadingComplete }) => {
    const [show, setShow] = useState(true);
    const clangSoundRef = useRef<HTMLAudioElement | null>(null);
    const sirenSoundRef = useRef<HTMLAudioElement | null>(null);
    const logoText = "MAKOTI TRADERS";

    useEffect(() => {
        // Attempt to play sounds automatically
        try {
            sirenSoundRef.current = new Audio('/assets/media/siren.mp3');
            sirenSoundRef.current.loop = true;
            sirenSoundRef.current.volume = 0.3;
            sirenSoundRef.current.play().catch(e => console.warn("Audio autoplay was blocked. User interaction is required to hear sound."));
        } catch (e) {
            console.error('Siren sound not found. Place it in /public/assets/media/siren.mp3');
        }

        try {
            clangSoundRef.current = new Audio('/assets/media/clang.mp3');
            clangSoundRef.current.volume = 0.5;
        } catch (e) {
            console.error('Clang sound not found. Place it in /public/assets/media/clang.mp3');
        }

        // Sound synchronization
        const soundInterval = setInterval(() => {
            clangSoundRef.current?.play().catch(() => {});
        }, 1000);

        // Sequence completion
        const sequenceTimer = setTimeout(() => {
            setShow(false);
            // Fade out sounds
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
        }, 9000); // Total duration of the cinematic sequence

        return () => {
            clearTimeout(sequenceTimer);
            clearInterval(soundInterval);
            sirenSoundRef.current?.pause();
            clangSoundRef.current?.pause();
        };
    }, [onLoadingComplete]);

    if (!show) return null;

    return (
        <div className='gta-loader'>
            <div className='scene'>
                <div className='asphalt'></div>
                <div className='siren-light red'></div>
                <div className='siren-light blue'></div>
            </div>

            <div className='logo-container'>
                <h1 className='logo-text' data-text={logoText}>{logoText}</h1>
            </div>

            <div className='film-grain'></div>
        </div>
    );
};

export default AppLoader;
