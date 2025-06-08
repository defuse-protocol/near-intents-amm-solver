# build docker image
docker buildx build --load --platform linux/amd64 -t intents-tee-amm-solver:latest -f Dockerfile .

# publish docker image
export OWNER=robortyan
docker tag intents-tee-amm-solver:latest ${OWNER}/intents-tee-amm-solver:latest
docker push ${OWNER}/intents-tee-amm-solver:latest
