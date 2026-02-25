#!/usr/bin/env python3
"""Wrapper for StableVideoDiffusion inference.

NOTE: Model license may be non-commercial (OpenRAIL-M). Verify before production use.
This is a template; adapt paths and model id as needed.
"""
import os
import torch
from diffusers import StableVideoDiffusionPipeline


def generate_video_from_image(input_image_path: str, output_path: str, prompt: str = None, num_frames: int = 14, seed: int = 42, device: str = 'cuda') -> str:
    """Generate video using StableVideoDiffusion (img2vid).

    Returns path to saved MP4.
    """
    model_id = os.environ.get('SVD_MODEL_ID', 'stabilityai/stable-video-diffusion-img2vid-xt')
    dtype = torch.float16
    pipe = StableVideoDiffusionPipeline.from_pretrained(model_id, torch_dtype=dtype).to(device)
    generator = torch.Generator(device=device).manual_seed(seed)

    result = pipe(image=input_image_path, prompt=prompt, num_frames=num_frames, generator=generator)
    video = result.videos[0]
    video.save(output_path)
    return output_path


if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument('--image', required=True)
    parser.add_argument('--out', required=True)
    parser.add_argument('--prompt', default='')
    parser.add_argument('--frames', type=int, default=14)
    parser.add_argument('--seed', type=int, default=42)
    args = parser.parse_args()
    path = generate_video_from_image(args.image, args.out, prompt=args.prompt, num_frames=args.frames, seed=args.seed)
    print('Saved', path)
