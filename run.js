// run.js
const fs = require('fs');
const axios = require('axios');
const cheerio = require('cheerio');
const cliProgress = require('cli-progress');
const path = require('path');

const { getPostContent, scrapeBoardPages } = require('./src/scraper');
const {askQuestion,validateNumberInput } = require('./src/util');

const OUTPUT_DIR = './output';


async function scrapePostsWithProgress(startNo, endNo, galleryId) {
    if (startNo > endNo) {
        [startNo, endNo] = [endNo, startNo];
    }
    const numbers = Array.from({ length: endNo - startNo + 1 }, (_, i) => startNo + i);
    return await scrapePostsWithArray(numbers, galleryId);
}

//번호 배열로 입력받고 게시글 크롤링
/**
 *
 * @param numbers {Array} 게시글 번호 배열
 * @param galleryId
 * @returns {Promise<Array>} 크롤링된 게시글 배열
 */
async function scrapePostsWithArray(numbers, galleryId) {
    const totalPosts = numbers.length;
    const progressBar = new cliProgress.SingleBar({
        format: '게시글 번호 크롤링 진행 |{bar}| {percentage}% || {value}/{total} 게시글',
        hideCursor: true
    }, cliProgress.Presets.shades_classic);
    progressBar.start(totalPosts, 0);

    const posts = [];
    for (const no of numbers) {
        try {
            const post = await getPostContent(galleryId, no);
            if(!post) {
                console.error(`게시글 ${no} 크롤링 실패`);
                continue;
            }
            posts.push(post);
        } catch (error) {
            console.error(`게시글 ${no} 크롤링 중 에러 발생: ${error.message}`);
        }
        progressBar.increment();
        await new Promise(resolve => setTimeout(resolve, 50));
    }
    progressBar.stop();
    return posts;
}

async function scrapeBoardPagesWithProgress(startPage, endPage, galleryId, typeParam='all') {
    

    let postNumbers = [];
    try {
        postNumbers = await scrapeBoardPages(startPage, endPage, galleryId, typeParam);
    } catch (error) {
        console.error(`게시판 페이지 크롤링 중 에러 발생: ${error.message}`);
    }

    postNumbers = [...new Set(postNumbers)];

    const totalPosts = postNumbers.length;
    const postBar = new cliProgress.SingleBar({
        format: '게시글 크롤링 진행 |{bar}| {percentage}% || {value}/{total} 게시글',
        hideCursor: true
    }, cliProgress.Presets.shades_classic);
    postBar.start(totalPosts, 0);

    const delay = 10; // 요청 간 딜레이

    const posts = [];
    for (const no of postNumbers) {
        const time = new Date();
        try {
            const post = await getPostContent(galleryId, no);
            posts.push(post);
        } catch (error) {
            console.error(`게시글 ${no} 크롤링 중 에러 발생: ${error.message}`);
        }
        postBar.increment();

        const elapsedTime = new Date() - time;
        if (elapsedTime < delay) {
            await new Promise(resolve => setTimeout(resolve, delay - elapsedTime));
        }
    }
    postBar.stop();
    return posts;
}

async function main() {
    try {
        console.log('DCInside 갤러리 크롤링 프로그램');

        console.log('크롤링할 갤러리 ID를 입력하세요:');
        let galleryId = await askQuestion('갤러리 ID(기본:chatgpt): ');
        if (!galleryId) {
            galleryId = 'chatgpt';
        }

        console.log("==========================");
        console.log('옵션을 선택하세요(기본:1):');
        console.log('1: 게시글 번호 범위로 크롤링');
        console.log('2: 게시판 페이지 범위로 크롤링');
        console.log('3: 게시글 번호로 크롤링');

        const option = await askQuestion('옵션 선택 (1~3): ');

        if (option !== '1' && option !== '2' && option !== '3') {
            console.log('올바르지 않은 옵션입니다.');
            return;
        }

        let typeParam = 'all';
        if(option === '2') {
            console.log("==========================");
            console.log('게시판을 선택하세요(기본:1):');
            console.log('1: 전체글');
            console.log('2: 개념글');
            console.log('3: 공지');

            const type = await askQuestion('게시판 선택 (1~3): ');
            typeParam = 'all';
            if (type === '1') {
                typeParam = 'all';
            }
            else if (type === '2') {
                typeParam = 'recommend';
            } else if (type === '3') {
                typeParam = 'notice';
            } else {
                console.log('올바르지 않은 게시판입니다.');
                return;
            }
        }


        let posts = [];
        if (option === '1') {
            const startNo = validateNumberInput(await askQuestion('시작 게시글 번호: '), 1);
            const endNo = validateNumberInput(await askQuestion('끝 게시글 번호: '), startNo);
            posts = await scrapePostsWithProgress(startNo, endNo, galleryId);
        } else if (option === '2') {
            const startPage = validateNumberInput(await askQuestion('시작 페이지 번호: '), 1);
            const endPage = validateNumberInput(await askQuestion('끝 페이지 번호: '), startPage);
            posts = await scrapeBoardPagesWithProgress(startPage, endPage, galleryId, typeParam);
        } else if (option === '3') {
            const numbers = await askQuestion('게시글 번호를 쉼표로 구분하여 입력하세요: ');
            const noArray = numbers.split(',').map(num => num.trim()).filter(num => num);
            if (noArray.length === 0) {
                console.log('게시글 번호가 입력되지 않았습니다.');
                return;
            }
            posts = await scrapePostsWithProgress(startNo, endNo, galleryId);
        } else {
            console.log('올바르지 않은 옵션입니다.');
            return;
        }

        console.log('크롤링 완료!');
        if (posts.length > 3) {
            console.log(`게시글 개수: ${posts.length}`);
            console.log('게시글 일부 미리보기:');
            console.log(JSON.stringify(posts.slice(0, 3), null, 2));
        } else {
            console.log(JSON.stringify(posts, null, 2));
        }

        if (!fs.existsSync(OUTPUT_DIR)) {
            fs.mkdirSync(OUTPUT_DIR);
        }

        const filename = `${new Date().toISOString().replace(/[-:T]/g, '').slice(0, 15)}json`;
        const filePath = path.join(OUTPUT_DIR, filename);

        fs.writeFile(filePath, JSON.stringify(posts, null, 2), (err) => {
            if (err) {
                console.error('JSON 파일 저장 실패:', err);
            } else {
                console.log(`크롤링 결과가 ${filePath} 파일에 저장되었습니다.`);
            }
        });
    } catch (error) {
        console.error('프로그램 실행 중 에러 발생:', error.message);
    }
}

main();
