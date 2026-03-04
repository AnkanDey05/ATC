/**
 * TTS Premium — ElevenLabs API
 * Configurable voice IDs per ATC station for maximum realism.
 */
class TtsPremium {
    constructor(apiKey) {
        this.apiKey = apiKey;

        // Default ElevenLabs voice IDs (users can customize per station)
        this.voiceMap = {
            'Ground': '21m00Tcm4TlvDq8ikWAM',    // Rachel
            'Tower': 'AZnzlk1XvdvUeBnXmlld',      // Domi
            'Approach': 'EXAVITQu4vr4xnSDxMaL',   // Bella
            'Center': 'ErXwobaYiN019PkySvjV',      // Antoni
            'ATIS': 'MF3mGyEYCl7XYWbV9V6O',       // Elli
            'Clearance': '21m00Tcm4TlvDq8ikWAM',  // Rachel
            'Departure': 'AZnzlk1XvdvUeBnXmlld',  // Domi
        };
    }

    setVoiceId(station, voiceId) {
        this.voiceMap[station] = voiceId;
    }

    async synthesize(text, stationLabel = 'Ground') {
        if (!this.apiKey) throw new Error('ElevenLabs API key not configured');

        const voiceId = this.voiceMap[stationLabel] || this.voiceMap['Ground'];

        const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
            method: 'POST',
            headers: {
                'Accept': 'audio/mpeg',
                'Content-Type': 'application/json',
                'xi-api-key': this.apiKey,
            },
            body: JSON.stringify({
                text,
                model_id: 'eleven_monolingual_v1',
                voice_settings: {
                    stability: 0.6,
                    similarity_boost: 0.8,
                    style: 0.2,
                    use_speaker_boost: true,
                },
            }),
        });

        if (!response.ok) {
            throw new Error(`ElevenLabs API error: ${response.status}`);
        }

        const buffer = Buffer.from(await response.arrayBuffer());
        return buffer;
    }
}

module.exports = { TtsPremium };
