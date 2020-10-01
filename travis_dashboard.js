let REPO_URL = "https://api.github.com/orgs/ARPA-SIMC/repos";
let TRAVIS_BASE_URL = "https://api.travis-ci.org"

let images = [
    "centos:7",
    "centos:8",
    "fedora:31",
    "fedora:32",
    "fedora:33",
    "fedora:rawhide"
];

let tr = document.querySelector("thead > tr");
images.forEach(image => {
    tr.innerHTML += `<th>${image}</th>`;
});

function get_github_repos() {
    let get_github_repos_recursive = function(repos, page){
        return new Promise((resolve, reject) => {
            return fetch(`${REPO_URL}?page=${page}`)
                .then(resp => resp.json())
                .then(json => {
                    if (json.length) {
                        repos = repos.concat(json);
                        get_github_repos_recursive(repos, page+1).then(resolve);
                    } else {
                        resolve(repos);
                    }
                })
        })
    }
    return get_github_repos_recursive([], 1)
}

get_github_repos()
    .then(json => {
        json.sort((a, b) => {
            let name_a = a["name"].toLowerCase();
            let name_b = b["name"].toLowerCase();
            if (name_a < name_b) {
                return -1;
            }
            if (name_a > name_b) {
                return 1;
            }
            return 0
        });
        Promise.all(json.map(repo => {
            return fetch(`${TRAVIS_BASE_URL}/repos/${repo.full_name}/branches/master`)
                .then(resp => resp.json())
                .then(json => {
                    try {
                        let branch = json.branch;
                        let job_ids = branch.job_ids
                        return Promise.all(job_ids.map(job_id => {
                            return fetch(`${TRAVIS_BASE_URL}/jobs/${job_id}`)
                                .then(resp => resp.json())
                        }))
                            .then(jobs => {
                                return {
                                    "id": branch.id,
                                    "name": repo.name,
                                    "full_name": repo.full_name,
                                    "state": branch.state,
                                    "finished_at": branch.finished_at,
                                    "jobs": images.map(image => {
                                        if (!jobs) {
                                            return null;
                                        }
                                        let job = jobs.find(job => job.config.env == `DOCKER_IMAGE=${image}`);
                                        if (!job) {
                                            return null;
                                        }
                                        let state = "running";
                                        if (job.state  == "finished") {
                                            if (job.status == 0) {
                                                state = "passed"
                                            } else if (job.status == null) {
                                                state = "errored"
                                            } else {
                                                state = "failed"
                                            }
                                        }
                                        return {
                                            "id": job.id,
                                            "status": job.status,
                                            "state": state
                                        }
                                    })
                                }
                            });
                    } catch(e) {
                        return null;
                    }
                });
        })).then(results => {
            document.querySelector(".loader").style.display = 'none';
            let builds = results.filter(r => r);
            let tbody = document.querySelector("tbody");
            builds.forEach(build => {
                let tr = `
                    <tr>
                        <td>
                            <a href="https://github.com/${build.full_name}">${build.name}</a>
                        </td>
                        <td class="status-${build.state}">
                            <a href="https://travis-ci.org/github/${build.full_name}/builds/${build.id}">
                                ${build.state}
                            </a>
                        </td>
                `;
                if (build.finished_at) {
                    tr += `<td>${build.finished_at}</td>`;
                } else {
                    tr += "<td></td>";
                }
                tr += build.jobs.map(job => {
                    if (job) {
                        return `
                        <td class="status-${job.state}">
                            <a href="https://travis-ci.org/github/${build.full_name}/jobs/${job.id}">
                                ${job.state}
                            </a>
                        </td>`;
                    } else {
                        return "<td></td>"
                    }
                }).join("\n");
                tbody.innerHTML += tr;
            });
        });
    });
